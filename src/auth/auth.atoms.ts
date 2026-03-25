import { ConnectError } from '@connectrpc/connect'
import { authRPCAtom } from '@/api/rpc'
import { atom } from 'jotai'
import { jwtAtom, jwtDataAtom } from './jwt.atoms'

export const signInAtom = atom(null, async (get, set, { email, password }: { email: string; password: string }) => {
  const authRPC = get(authRPCAtom)
  try {
    const resp = await authRPC.signInWithEmail({ email, password })
    set(jwtAtom, resp.token)
    return { ok: true as const }
  } catch (error) {
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
    const msg = error instanceof ConnectError ? error.message : 'Sign up failed'
    return { ok: false as const, error: msg }
  }
})

export const isAuthenticatedAtom = atom(get => {
  const data = get(jwtDataAtom)
  if (!data) return false
  return data.exp > Date.now() / 1000
})
