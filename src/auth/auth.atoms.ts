import { Code, ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import type { GetMeResponse } from '@/api/genproto/dashboard/customers/v1/customers_pb'
import { authRPCAtom, customersRPCAtom } from '@/api/rpc'
import { resetWorkspaceAtom } from '@/data/workspace.atoms'
import { jwtAtom, jwtDataAtom } from './jwt.atoms'

export const signInAtom = atom(null, async (get, set, { email, password }: { email: string; password: string }) => {
  const authRPC = get(authRPCAtom)
  try {
    const resp = await authRPC.signInWithEmail({ email, password })
    set(jwtAtom, resp.token)
    return { ok: true as const }
  } catch (error) {
    if (!(error instanceof ConnectError)) console.error('signIn unexpected error', error)
    const msg = error instanceof ConnectError ? error.message : 'Sign in failed'
    return { ok: false as const, error: msg }
  }
})

export type Me = Pick<GetMeResponse, 'customerId' | 'email' | 'emailVerified'>

// Current signed-in customer. email is NOT in the JWT, so it must come from GetMe.
export const meAtom = atom<Me | null>(null)

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

export const requestMagicLinkAtom = atom(null, async (get, _set, { email }: { email: string }) => {
  const authRPC = get(authRPCAtom)
  try {
    await authRPC.requestMagicLink({ email })
    return { ok: true as const }
  } catch (error) {
    if (!(error instanceof ConnectError)) console.error('requestMagicLink unexpected error', error)
    const msg = error instanceof ConnectError ? error.message : 'Could not send the sign-in link'
    return { ok: false as const, error: msg }
  }
})

// Completing a magic link returns a session JWT. The token alone decides identity
// (the server ignores any caller session), so capture the prior identity before
// overwriting the JWT: if the link is for a different account, drop the previous
// session's remembered org so it can't leak across the switch. Always clear meAtom
// — email isn't in the JWT and must be refetched for the new identity.
export const completeMagicLinkAtom = atom(null, async (get, set, { token }: { token: string }) => {
  const authRPC = get(authRPCAtom)
  const prior = get(jwtDataAtom)?.customerId
  try {
    const resp = await authRPC.completeMagicLink({ token })
    set(jwtAtom, resp.token)
    const next = get(jwtDataAtom)?.customerId
    if (prior && next && prior !== next) set(resetWorkspaceAtom)
    set(meAtom, null)
    return { ok: true as const }
  } catch (error) {
    if (error instanceof ConnectError && error.code === Code.InvalidArgument) {
      return { ok: false as const, error: 'This link is invalid or has expired. Request a new one.' }
    }
    if (!(error instanceof ConnectError)) console.error('completeMagicLink unexpected error', error)
    return { ok: false as const, error: error instanceof ConnectError ? error.message : 'Could not sign you in.' }
  }
})

const authClockAtom = atom(Date.now())
authClockAtom.onMount = setAtom => {
  const tick = () => setAtom(Date.now())
  tick()
  const interval = window.setInterval(tick, 30_000)
  return () => window.clearInterval(interval)
}

export const isAuthenticatedAtom = atom(get => {
  get(authClockAtom)
  const data = get(jwtDataAtom)
  if (!data) return false
  return data.exp > Date.now() / 1000
})

export const signOutAtom = atom(null, (_, set) => {
  set(jwtAtom, '')
  set(meAtom, null)
  set(resetWorkspaceAtom)
})
