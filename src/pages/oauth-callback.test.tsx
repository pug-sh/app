import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { type AuthProviderConfig, AuthProviderType } from '@/api/genproto/public/auth/v1/auth_pb'

const state = vi.hoisted(() => ({ providers: [] as AuthProviderConfig[] }))
const completeOIDC = vi.hoisted(() =>
  vi.fn(async (_get: unknown, _set: unknown, _input: unknown) => ({ ok: true as const })),
)
const oidc = vi.hoisted(() => ({
  clearPendingOIDCProvider: vi.fn(),
  completeOIDCRedirect: vi.fn(),
  pendingOIDCProviderID: vi.fn(() => 'company_sso'),
}))

vi.mock('@/auth/auth.atoms', async () => {
  const { atom } = await import('jotai')
  return {
    authProvidersAtom: atom(() => state.providers),
    completeOIDCAtom: atom(null, completeOIDC),
  }
})

vi.mock('@/auth/oidc', () => oidc)

const OAuthCallback = (await import('./oauth-callback')).default

const renderCallback = () =>
  render(
    <Provider>
      <Router hook={memoryLocation({ path: '/oauth/callback' }).hook}>
        <OAuthCallback />
      </Router>
    </Provider>,
  )

describe('OAuth callback provider lookup', () => {
  beforeEach(() => {
    state.providers = []
    oidc.clearPendingOIDCProvider.mockReset()
    oidc.completeOIDCRedirect.mockReset()
    oidc.pendingOIDCProviderID.mockReset().mockReturnValue('company_sso')
    completeOIDC.mockClear()
  })

  it('preserves pending state when provider configuration could not be loaded', async () => {
    renderCallback()

    await screen.findByText('Sign-in options could not be loaded. Try again.')
    expect(oidc.clearPendingOIDCProvider).not.toHaveBeenCalled()
    expect(oidc.completeOIDCRedirect).not.toHaveBeenCalled()
  })

  it('clears pending state for a provider that is no longer configured', async () => {
    state.providers = [
      {
        id: 'other_sso',
        type: AuthProviderType.OIDC,
        displayName: 'Other SSO',
        clientId: 'pug',
        issuerUrl: 'https://login.example.com',
        scopes: ['openid'],
      } as AuthProviderConfig,
    ]

    renderCallback()

    await screen.findByText('This sign-in request is no longer available. Start again from the sign-in page.')
    expect(oidc.clearPendingOIDCProvider).toHaveBeenCalledOnce()
    expect(oidc.completeOIDCRedirect).not.toHaveBeenCalled()
  })

  it('sends the authorization code and PKCE values to the server completion endpoint', async () => {
    state.providers = [
      {
        id: 'company_sso',
        type: AuthProviderType.OIDC,
        displayName: 'Company SSO',
        clientId: 'pug',
        issuerUrl: 'https://login.example.com',
        scopes: ['openid'],
      } as AuthProviderConfig,
    ]
    oidc.completeOIDCRedirect.mockResolvedValue({
      code: 'authorization-code',
      codeVerifier: 'code-verifier',
      redirectURI: 'http://localhost/oauth/callback',
      nonce: 'request-nonce',
    })

    renderCallback()

    await vi.waitFor(() =>
      expect(completeOIDC.mock.calls[0]?.[2]).toEqual({
        providerId: 'company_sso',
        code: 'authorization-code',
        codeVerifier: 'code-verifier',
        redirectURI: 'http://localhost/oauth/callback',
        nonce: 'request-nonce',
        displayName: 'Company SSO',
      }),
    )
  })
})
