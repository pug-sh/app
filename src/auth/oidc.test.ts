import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthProviderConfig } from '@/api/genproto/public/auth/v1/auth_pb'

const oidc = vi.hoisted(() => ({
  signinRedirect: vi.fn(),
  readSigninResponseState: vi.fn(),
  clearStaleState: vi.fn(),
}))

vi.mock('oidc-client-ts', () => ({
  WebStorageStateStore: class {},
  OidcClient: class {
    readSigninResponseState = oidc.readSigninResponseState
  },
  UserManager: class {
    signinRedirect = oidc.signinRedirect
    clearStaleState = oidc.clearStaleState
  },
}))

import { completeOIDCRedirect, pendingOIDCProviderID, startOIDCSignIn } from './oidc'

const provider = {
  id: 'company_sso',
  displayName: 'Company SSO',
  clientId: 'pug',
  issuerUrl: 'https://login.example.com/realms/main',
  scopes: ['openid', 'profile', 'email'],
} as AuthProviderConfig

// Sized to the CompleteOIDCSignInRequest constraints (code_verifier min_len 43, nonce min_len 16).
const codeVerifier = 'a'.repeat(43)
const nonce = '2ec3f0a1-6b1e-4f0e-9d0a-6a1c3b5d7e9f'

const storedState = () => ({
  authority: provider.issuerUrl,
  client_id: provider.clientId,
  redirect_uri: `${window.location.origin}/oauth/callback`,
  code_verifier: codeVerifier,
  nonce,
})

describe('OIDC redirect lifecycle', () => {
  beforeEach(() => {
    sessionStorage.clear()
    oidc.signinRedirect.mockReset()
    oidc.readSigninResponseState.mockReset()
    oidc.clearStaleState.mockReset().mockResolvedValue(undefined)
  })

  it('clears the pending provider when starting the redirect fails', async () => {
    oidc.signinRedirect.mockRejectedValue(new Error('redirect failed'))

    await expect(startOIDCSignIn(provider)).rejects.toThrow('redirect failed')
    expect(pendingOIDCProviderID()).toBe('')
  })

  it('clears stale redirect state before starting a new redirect', async () => {
    oidc.signinRedirect.mockResolvedValue(undefined)

    await startOIDCSignIn(provider)

    expect(oidc.clearStaleState).toHaveBeenCalledOnce()
    expect(oidc.clearStaleState.mock.invocationCallOrder[0]).toBeLessThan(
      oidc.signinRedirect.mock.invocationCallOrder[0],
    )
    // The callback page finds the provider by this key; without it every sign-in dead-ends.
    expect(pendingOIDCProviderID()).toBe(provider.id)
    // CompleteOIDCSignInRequest.nonce is min_len 16, so a shorter one never reaches the server.
    expect(oidc.signinRedirect.mock.calls[0][0].nonce.length).toBeGreaterThanOrEqual(16)
  })

  it('returns the code and original PKCE values without exchanging tokens in the browser', async () => {
    oidc.readSigninResponseState.mockResolvedValue({
      response: { code: 'authorization-code', error: null },
      state: storedState(),
    })
    sessionStorage.setItem('pug.oidc.pending-provider', provider.id)

    await expect(completeOIDCRedirect(provider)).resolves.toEqual({
      code: 'authorization-code',
      codeVerifier,
      redirectURI: `${window.location.origin}/oauth/callback`,
      nonce,
    })
    expect(pendingOIDCProviderID()).toBe('')
    expect(oidc.readSigninResponseState).toHaveBeenCalledWith(window.location.href, true)
  })

  it('surfaces a rejection from the identity provider', async () => {
    oidc.readSigninResponseState.mockResolvedValue({
      response: { code: null, error: 'access_denied' },
      state: storedState(),
    })

    await expect(completeOIDCRedirect(provider)).rejects.toThrow('The identity provider rejected the sign-in request')
  })

  // sessionStorage cleared between the redirect and the return (new tab, Safari ITP) — without the
  // guard the app posts an undefined verifier and the server rejects it as a malformed request.
  it('rejects a callback missing its PKCE verifier', async () => {
    oidc.readSigninResponseState.mockResolvedValue({
      response: { code: 'authorization-code', error: null },
      state: { ...storedState(), code_verifier: undefined },
    })

    await expect(completeOIDCRedirect(provider)).rejects.toThrow(
      'OIDC response did not include the required authorization values',
    )
  })

  it.each([
    ['authority', { authority: 'https://attacker.example.com' }],
    ['client_id', { client_id: 'someone-else' }],
    ['redirect_uri', { redirect_uri: 'https://attacker.example.com/oauth/callback' }],
  ])('rejects a callback whose stored %s does not match the selected provider', async (_field, override) => {
    oidc.readSigninResponseState.mockResolvedValue({
      response: { code: 'authorization-code', error: null },
      state: { ...storedState(), ...override },
    })
    sessionStorage.setItem('pug.oidc.pending-provider', provider.id)

    await expect(completeOIDCRedirect(provider)).rejects.toThrow(
      'OIDC response did not match the original sign-in request',
    )
    expect(pendingOIDCProviderID()).toBe('')
  })
})
