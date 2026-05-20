import { ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import { authRPCAtom } from '@/api/rpc'
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

export const signUpAtom = atom(
  null,
  async (get, set, { email, password, inviteToken }: { email: string; password: string; inviteToken?: string }) => {
    const authRPC = get(authRPCAtom)
    try {
      // inviteToken (when set) makes the backend join the invited org and skip
      // default-org creation; empty/undefined falls back to a normal signup.
      const resp = await authRPC.signUpWithEmail({ email, password, inviteToken })
      set(jwtAtom, resp.token)
      return { ok: true as const }
    } catch (error) {
      if (!(error instanceof ConnectError)) console.error('signUp unexpected error', error)
      const msg = error instanceof ConnectError ? error.message : 'Sign up failed'
      return { ok: false as const, error: msg }
    }
  },
)

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
  set(resetWorkspaceAtom)
})
