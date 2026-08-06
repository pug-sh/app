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
    expect(oidc.signinRedirect).toHaveBeenCalledWith({ nonce: expect.any(String) })
  })

  it('returns the code and original PKCE values without exchanging tokens in the browser', async () => {
    const redirectURI = `${window.location.origin}/oauth/callback`
    oidc.readSigninResponseState.mockResolvedValue({
      response: { code: 'authorization-code', error: null },
      state: {
        authority: provider.issuerUrl,
        client_id: provider.clientId,
        redirect_uri: redirectURI,
        code_verifier: 'code-verifier',
        nonce: 'request-nonce',
      },
    })
    sessionStorage.setItem('pug.oidc.pending-provider', provider.id)

    await expect(completeOIDCRedirect(provider)).resolves.toEqual({
      code: 'authorization-code',
      codeVerifier: 'code-verifier',
      redirectURI,
      nonce: 'request-nonce',
    })
    expect(pendingOIDCProviderID()).toBe('')
    expect(oidc.readSigninResponseState).toHaveBeenCalledWith(window.location.href, true)
  })

  it('rejects a callback whose stored request does not match the selected provider', async () => {
    oidc.readSigninResponseState.mockResolvedValue({
      response: { code: 'authorization-code', error: null },
      state: {
        authority: 'https://attacker.example.com',
        client_id: provider.clientId,
        redirect_uri: `${window.location.origin}/oauth/callback`,
        code_verifier: 'code-verifier',
        nonce: 'request-nonce',
      },
    })
    sessionStorage.setItem('pug.oidc.pending-provider', provider.id)

    await expect(completeOIDCRedirect(provider)).rejects.toThrow(
      'OIDC response did not match the original sign-in request',
    )
    expect(pendingOIDCProviderID()).toBe('')
  })
})
