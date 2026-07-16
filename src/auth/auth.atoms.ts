import { Code, ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import { toast } from 'sonner'
import { trackEvent } from '@/analytics/pug'
import type { GetMeResponse } from '@/api/genproto/dashboard/customers/v1/customers_pb'
import { OAuthProvider } from '@/api/genproto/public/auth/v1/auth_pb'
import { authRPCAtom, customersRPCAtom } from '@/api/rpc'
import { resetWorkspaceAtom } from '@/data/workspace.atoms'
import { browserTimezone } from '@/lib/timezone'
import { isDemoEnabled, isDemoSessionAtom } from './demo'
import { jwtAtom, jwtDataAtom, refreshTokenAtom } from './jwt.atoms'
import { isGoogleOAuthEnabled, mapOAuthConnectError } from './oauth'

// Result shape shared by every auth write atom: `error` is present iff the call failed.
export type AuthResult = { ok: true } | { ok: false; error: string }

// Build-time gate for the Google sign-in button (driven by VITE_GOOGLE_CLIENT_ID), exposed as
// an atom so config reads flow through the store like the rest of auth state.
export const googleOAuthEnabledAtom = atom(() => isGoogleOAuthEnabled())

// Build-time gate for the sign-in page's "Explore the live demo" link, driven by VITE_DEMO_ENABLED
// (not the in-app banner — that follows the active demo session; see isDemoSessionAtom). Exposed as
// an atom for parity with googleOAuthEnabledAtom.
export const demoEnabledAtom = atom(() => isDemoEnabled())

export const signInAtom = atom(
  null,
  async (get, set, { email, password }: { email: string; password: string }): Promise<AuthResult> => {
    const authRPC = get(authRPCAtom)
    try {
      const resp = await authRPC.signInWithEmail({ email, password })
      set(applySessionAtom, { token: resp.token, refreshToken: resp.refreshToken, method: 'password' })
      return { ok: true }
    } catch (error) {
      if (!(error instanceof ConnectError)) console.error('signIn unexpected error', error)
      const msg = error instanceof ConnectError ? error.message : 'Sign in failed'
      return { ok: false, error: msg }
    }
  },
)

export type Me = Pick<GetMeResponse, 'customerId' | 'email' | 'emailVerified'>

// Current signed-in customer. email is NOT in the JWT, so it must come from GetMe.
export const meAtom = atom<Me | null>(null)

// How the session was obtained. Threaded in rather than inferred so every path that mints a
// session has to say which it is — a new one is a type error until it answers.
export type SignInMethod = 'password' | 'magic_link' | 'google' | 'demo'

// Applies a freshly issued session token pair — password sign-in, magic link, OAuth, and the demo
// all funnel here. The token alone decides identity (the server ignores any caller session), so
// capture the prior customer before overwriting: if the new token is for a different account,
// drop the previous session's remembered org so it can't leak across the switch. Always clear
// meAtom — email isn't in the JWT and must be refetched for the new identity.
const applySessionAtom = atom(
  null,
  (get, set, { token, refreshToken, method }: { token: string; refreshToken: string; method: SignInMethod }) => {
    const prior = get(jwtDataAtom)?.customerId
    set(jwtAtom, token)
    set(refreshTokenAtom, refreshToken)
    const next = get(jwtDataAtom)?.customerId
    if (prior && next && prior !== next) set(resetWorkspaceAtom)
    set(meAtom, null)
    // The demo marker is derived from the method and written in the same pass as the token, so a
    // real login clears a prior demo's banner and a demo login sets it. Deriving it (rather than
    // clearing here and letting demoSignInAtom set it true afterwards) removes the window where a
    // demo JWT is live while this still reads false — analytics identity keys off this flag, and
    // identifying the shared demo account would fuse every demo visitor into one profile.
    set(isDemoSessionAtom, method === 'demo')
    trackEvent('signin', { method })
  },
)

export const fetchMeAtom = atom(null, async (get, set) => {
  const customersRPC = get(customersRPCAtom)
  try {
    const resp = await customersRPC.getMe({})
    const me = { customerId: resp.customerId, email: resp.email, emailVerified: resp.emailVerified }
    set(meAtom, me)
    return me
  } catch (err) {
    if (!(err instanceof ConnectError)) console.error('fetchMe unexpected error', err)
    set(meAtom, null)
    return null
  }
})

export const requestMagicLinkAtom = atom(null, async (get, _set, { email }: { email: string }): Promise<AuthResult> => {
  const authRPC = get(authRPCAtom)
  try {
    await authRPC.requestMagicLink({ email })
    return { ok: true }
  } catch (error) {
    if (!(error instanceof ConnectError)) console.error('requestMagicLink unexpected error', error)
    const msg = error instanceof ConnectError ? error.message : 'Could not send the sign-in link'
    return { ok: false, error: msg }
  }
})

// Magic-link sign-in or sign-up; session handling (identity switch, workspace reset, meAtom
// reset) is delegated to applySessionJwtAtom.
export const completeMagicLinkAtom = atom(null, async (get, set, { token }: { token: string }): Promise<AuthResult> => {
  const authRPC = get(authRPCAtom)
  try {
    // Seed the auto-created default project's reporting zone from the browser.
    // Malformed/empty values are coerced to UTC server-side; correct later in settings.
    const resp = await authRPC.completeMagicLink({ token, timezone: browserTimezone() })
    set(applySessionAtom, { token: resp.token, refreshToken: resp.refreshToken, method: 'magic_link' })
    return { ok: true }
  } catch (error) {
    if (error instanceof ConnectError && error.code === Code.InvalidArgument) {
      return { ok: false, error: 'This link is invalid or has expired. Request a new one.' }
    }
    if (!(error instanceof ConnectError)) console.error('completeMagicLink unexpected error', error)
    return { ok: false, error: error instanceof ConnectError ? error.message : 'Could not sign you in.' }
  }
})

export const completeGoogleOAuthAtom = atom(
  null,
  async (get, set, { credential }: { credential: string }): Promise<AuthResult> => {
    const authRPC = get(authRPCAtom)
    try {
      // Seed the auto-created default project's reporting zone from the browser on
      // first sign-in (parity with completeMagicLink). Ignored server-side for a
      // returning user; malformed/empty values are coerced to UTC.
      const resp = await authRPC.completeOAuthSignIn({
        provider: OAuthProvider.GOOGLE,
        credential,
        timezone: browserTimezone(),
      })
      set(applySessionAtom, { token: resp.token, refreshToken: resp.refreshToken, method: 'google' })
      return { ok: true }
    } catch (error) {
      if (!(error instanceof ConnectError)) console.error('completeGoogleOAuth unexpected error', error)
      return {
        ok: false,
        error: mapOAuthConnectError(error, 'Could not sign you in. Try again from the sign-in page.'),
      }
    }
  },
)

// Credential-less sign-in for the public read-only demo viewer (snoop@pug.sh). The minted token is
// an ordinary viewer JWT — the role is never in the JWT (by design); viewer mode follows from the
// account's ORG_ROLE_VIEWER membership, which WorkspaceBootstrap loads into activeOrgAtom and
// currentRoleAtom reads, flipping useCan() read-only. We deliberately ignore the response's
// projectId rather than pinning it as x-project-id: correctness instead relies on the demo account
// being seeded with exactly one project, so WorkspaceBootstrap's default pick (projects[0]) is it.
// The frontend does no ordering of its own — revisit (pin projectId) if the demo account ever gains
// a second project, or it could scope the demo to the wrong data.
export const demoSignInAtom = atom(null, async (get, set): Promise<AuthResult> => {
  const authRPC = get(authRPCAtom)
  try {
    const resp = await authRPC.demoSignIn({})
    // method: 'demo' is what sets isDemoSessionAtom — see applySessionAtom.
    set(applySessionAtom, { token: resp.token, refreshToken: resp.refreshToken, method: 'demo' })
    return { ok: true }
  } catch (error) {
    // Unavailable = PUG_DEMO_ENABLED off or the demo account isn't seeded — expected, not a bug, so
    // don't log it. Anything else (Internal, PermissionDenied, ResourceExhausted, or a non-Connect
    // JS error) is unexpected; log it before the generic copy, or a "demo is down" incident leaves
    // no frontend trace at all.
    if (error instanceof ConnectError && error.code === Code.Unavailable) {
      return { ok: false, error: "The live demo isn't available right now." }
    }
    const detail = error instanceof ConnectError ? { code: error.code, message: error.message } : error
    console.error('demoSignIn failed', detail)
    return { ok: false, error: 'Could not start the demo. Please try again.' }
  }
})

// Authenticated whenever a refresh token is present. The access JWT is short-lived
// (~1h) and the transport silently re-mints it, so access-token expiry must NOT gate
// the UI or active users would be bounced to sign-in hourly. A failed refresh clears
// the refresh token (clearSession), flipping this to false.
export const isAuthenticatedAtom = atom(get => get(refreshTokenAtom) !== '')

export const signOutAtom = atom(null, async (get, set) => {
  // Ahead of the clear, and of the reset() the identity sync fires once the token is gone: track()
  // stamps the distinct ID at call time, so this is the last moment the event can be attributed to
  // the user who is leaving rather than to a fresh anonymous ID.
  trackEvent('signout')

  // Best-effort server-side revocation of the refresh token's family, so the
  // session can't be refreshed after logout. Clear locally regardless of outcome.
  const refreshToken = get(refreshTokenAtom)
  if (refreshToken) {
    try {
      await get(authRPCAtom).signOut({ refreshToken })
    } catch (err) {
      // Local sign-out still proceeds below, but a failed server revoke means the
      // refresh-token family may stay live — make that observable rather than
      // silently dropping it (matters most on a shared machine).
      console.error('signOut server revocation failed', err)
      if (err instanceof ConnectError && err.code !== Code.Unauthenticated) {
        toast.warning('Signed out on this device, but remote sessions may still be active.')
      }
    }
  }
  set(jwtAtom, '')
  set(refreshTokenAtom, '')
  set(meAtom, null)
  set(isDemoSessionAtom, false)
  set(resetWorkspaceAtom)
})
