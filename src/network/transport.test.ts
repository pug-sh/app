import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { getDefaultStore } from 'jotai'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService, SSORequiredSchema } from '@/api/genproto/public/auth/v1/auth_pb'

const refreshSession = vi.hoisted(() => vi.fn())

// Only the refresh client: the transport under test is real and never reaches the network,
// because a missing access token sends every request through a refresh first.
vi.mock('@connectrpc/connect', async importOriginal => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: () => ({ refreshSession }),
}))

const { transportAtom } = await import('./transport')
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')
const { ssoBlockAtom } = await import('@/auth/sso-required')

const store = getDefaultStore()

const request = () =>
  store.get(transportAtom).unary(AuthService.method.getAuthConfig, undefined, undefined, undefined, {})

describe('a refused session refresh', () => {
  beforeEach(() => {
    store.set(jwtAtom, '')
    store.set(refreshTokenAtom, 'refresh-token')
    store.set(ssoBlockAtom, null)
    refreshSession.mockReset()
  })

  it('shows the providers when the domain now requires SSO', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    refreshSession.mockRejectedValue(
      new ConnectError('acme.com accounts sign in through SSO', Code.Unauthenticated, undefined, [
        { desc: SSORequiredSchema, value: create(SSORequiredSchema, { domain: 'acme.com' }) },
      ]),
    )

    await expect(request()).rejects.toMatchObject({ code: Code.Unauthenticated })

    expect(store.get(refreshTokenAtom)).toBe('')
    expect(store.get(ssoBlockAtom)).toMatchObject({ detail: { domain: 'acme.com' }, sessionEnded: true })
    expect(error).not.toHaveBeenCalled()
  })

  it('still reports a plain expiry as one', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    refreshSession.mockRejectedValue(new ConnectError('session expired', Code.Unauthenticated))

    await expect(request()).rejects.toMatchObject({ code: Code.Unauthenticated })

    expect(store.get(ssoBlockAtom)).toBeNull()
    expect(error).toHaveBeenCalledWith('Session expired — please sign in again')
  })
})
