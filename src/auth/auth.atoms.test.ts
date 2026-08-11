import { Code, ConnectError } from '@connectrpc/connect'
import { createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type AuthProviderConfig, AuthProviderType } from '@/api/genproto/public/auth/v1/auth_pb'

const completeOIDCSignIn = vi.hoisted(() => vi.fn())

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { authRPCAtom: atom({ completeOIDCSignIn }), customersRPCAtom: atom({ getMe: vi.fn() }) }
})

vi.mock('@/analytics/pug', () => ({ trackEvent: vi.fn() }))

const { completeOIDCAtom } = await import('./auth.atoms')
const { jwtAtom, refreshTokenAtom } = await import('./jwt.atoms')
const { isDemoSessionAtom } = await import('./demo')

const provider = {
  id: 'company_sso',
  type: AuthProviderType.OIDC,
  displayName: 'Company SSO',
  clientId: 'pug',
  issuerUrl: 'https://login.example.com',
  scopes: ['openid'],
} as AuthProviderConfig

const authorization = {
  code: 'authorization-code',
  codeVerifier: 'a'.repeat(43),
  redirectURI: 'http://localhost/oauth/callback',
  nonce: '2ec3f0a1-6b1e-4f0e-9d0a-6a1c3b5d7e9f',
}

describe('completeOIDCAtom', () => {
  beforeEach(() => {
    localStorage.clear()
    completeOIDCSignIn.mockReset()
  })

  it('stores the issued session', async () => {
    completeOIDCSignIn.mockResolvedValue({ token: 'access-token', refreshToken: 'refresh-token' })
    const store = createStore()

    await expect(store.set(completeOIDCAtom, { provider, ...authorization })).resolves.toEqual({ ok: true })

    expect(store.get(jwtAtom)).toBe('access-token')
    expect(store.get(refreshTokenAtom)).toBe('refresh-token')
    // Derived from the sign-in method — a real login must not raise the demo banner.
    expect(store.get(isDemoSessionAtom)).toBe(false)
  })

  it('sends the provider id under its proto field name', async () => {
    completeOIDCSignIn.mockResolvedValue({ token: 'access-token', refreshToken: 'refresh-token' })

    await createStore().set(completeOIDCAtom, { provider, ...authorization })

    expect(completeOIDCSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'company_sso',
        code: authorization.code,
        codeVerifier: authorization.codeVerifier,
        redirectUri: authorization.redirectURI,
        nonce: authorization.nonce,
      }),
    )
  })

  it('leaves no session behind when the exchange fails', async () => {
    completeOIDCSignIn.mockRejectedValue(new ConnectError('oauth sign-in failed', Code.Unauthenticated))
    const store = createStore()

    await expect(store.set(completeOIDCAtom, { provider, ...authorization })).resolves.toEqual({
      ok: false,
      error: 'Invalid or expired Company SSO sign-in. Try again.',
    })
    expect(store.get(refreshTokenAtom)).toBe('')
  })
})
