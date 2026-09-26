import { ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import { type SSORequired, SSORequiredSchema } from '@/api/genproto/public/auth/v1/auth_pb'

export const ssoRequiredOf = (err: unknown) =>
  err instanceof ConnectError ? err.findDetails(SSORequiredSchema)[0] : undefined

export type SSOBlock = { detail: SSORequired; email?: string; sessionEnded?: boolean }

// Written by the sign-in form, and by the transport when a refresh is refused.
export const ssoBlockAtom = atom<SSOBlock | null>(null)
