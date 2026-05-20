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

export const signUpAtom = atom(null, async (get, set, { email, password }: { email: string; password: string }) => {
  const authRPC = get(authRPCAtom)
  try {
    const resp = await authRPC.signUpWithEmail({ email, password })
    set(jwtAtom, resp.token)
    return { ok: true as const }
  } catch (error) {
    if (!(error instanceof ConnectError)) console.error('signUp unexpected error', error)
    const msg = error instanceof ConnectError ? error.message : 'Sign up failed'
    return { ok: false as const, error: msg }
  }
})

// Invite signup: the backend derives the customer's email from the invite token,
// so we send no email. signUpAtom keeps its required-email contract for the
// normal signup on sign-in.tsx. A bad/expired/consumed token comes back as
// CodeFailedPrecondition ("invitation is no longer valid").
export const acceptInviteSignUpAtom = atom(
  null,
  async (get, set, { password, inviteToken }: { password: string; inviteToken: string }) => {
    const authRPC = get(authRPCAtom)
    try {
      const resp = await authRPC.signUpWithEmail({ password, inviteToken })
      set(jwtAtom, resp.token)
      return { ok: true as const }
    } catch (error) {
      if (error instanceof ConnectError && error.code === Code.FailedPrecondition) {
        return { ok: false as const, error: 'This invitation is no longer valid — ask for a fresh one.' }
      }
      if (!(error instanceof ConnectError)) console.error('acceptInviteSignUp unexpected error', error)
      const msg = error instanceof ConnectError ? error.message : 'Sign up failed'
      return { ok: false as const, error: msg }
    }
  },
)

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
