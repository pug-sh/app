import { OidcClient, UserManager, type UserManagerSettings, WebStorageStateStore } from 'oidc-client-ts'
import type { AuthProviderConfig } from '@/api/genproto/public/auth/v1/auth_pb'

const callbackPath = '/oauth/callback'
const pendingProviderKey = 'pug.oidc.pending-provider'
const pendingInviteKey = 'pug.oidc.pending-invite'

// Keyed on the issuer, not the id — the id is operator-chosen and can be anything.
export const isGoogleProvider = (provider: AuthProviderConfig) =>
  provider.issuerUrl.startsWith('https://accounts.google.com')

// loginHint and domain only steer the provider's account picker; the server checks the token.
// inviteToken rides this one attempt, so a later sign-in in the tab can't carry an old invite.
export type OIDCSignInOptions = { loginHint?: string; domain?: string; inviteToken?: string }

// Annotated: without a target type the object literal gets no excess-property check, so a typo in
// any optional key silently falls back to the library default (scope → "openid", store → local).
const settingsFor = (provider: AuthProviderConfig): UserManagerSettings => ({
  authority: provider.issuerUrl,
  client_id: provider.clientId,
  redirect_uri: `${window.location.origin}${callbackPath}`,
  response_type: 'code',
  scope: provider.scopes.join(' '),
  loadUserInfo: false,
  automaticSilentRenew: false,
  stateStore: new WebStorageStateStore({ store: window.sessionStorage, prefix: 'pug.oidc.state.' }),
})

const managerFor = (provider: AuthProviderConfig) => new UserManager(settingsFor(provider))
const clientFor = (provider: AuthProviderConfig) => new OidcClient(settingsFor(provider))

export const startOIDCSignIn = async (
  provider: AuthProviderConfig,
  { loginHint, domain, inviteToken }: OIDCSignInOptions = {},
) => {
  sessionStorage.setItem(pendingProviderKey, provider.id)
  if (inviteToken) sessionStorage.setItem(pendingInviteKey, inviteToken)
  else sessionStorage.removeItem(pendingInviteKey)
  try {
    const manager = managerFor(provider)
    await manager.clearStaleState()
    await manager.signinRedirect({
      nonce: crypto.randomUUID(),
      login_hint: loginHint,
      // Google's hosted-domain hint.
      extraQueryParams: domain && isGoogleProvider(provider) ? { hd: domain } : undefined,
    })
  } catch (error) {
    clearPendingOIDCProvider()
    throw error
  }
}

export const pendingOIDCProviderID = () => sessionStorage.getItem(pendingProviderKey) ?? ''

// Read it before completeOIDCRedirect, which clears it along with the provider.
export const pendingOIDCInviteToken = () => sessionStorage.getItem(pendingInviteKey) ?? ''

export const clearPendingOIDCProvider = () => {
  sessionStorage.removeItem(pendingProviderKey)
  sessionStorage.removeItem(pendingInviteKey)
}

export const completeOIDCRedirect = async (provider: AuthProviderConfig) => {
  const expectedRedirectURI = `${window.location.origin}${callbackPath}`
  try {
    const { state, response } = await clientFor(provider).readSigninResponseState(window.location.href, true)
    if (response.error) throw new Error('The identity provider rejected the sign-in request')
    if (!response.code || !state.code_verifier || !state.nonce) {
      throw new Error('OIDC response did not include the required authorization values')
    }
    if (
      state.authority !== provider.issuerUrl ||
      state.client_id !== provider.clientId ||
      state.redirect_uri !== expectedRedirectURI
    ) {
      throw new Error('OIDC response did not match the original sign-in request')
    }
    return {
      code: response.code,
      codeVerifier: state.code_verifier,
      redirectURI: state.redirect_uri,
      nonce: state.nonce,
    }
  } finally {
    clearPendingOIDCProvider()
  }
}
