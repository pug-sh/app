import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { type AuthProviderConfig, AuthProviderType } from '@/api/genproto/public/auth/v1/auth_pb'

const state = vi.hoisted(() => ({ providers: null as AuthProviderConfig[] | null }))
const completeOIDC = vi.hoisted(() =>
  vi.fn(async (_get: unknown, _set: unknown, _input: unknown) => ({ ok: true }) as { ok: boolean; error?: string }),
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

const companySSO = {
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

const renderCallback = (wrapper: (node: React.ReactNode) => React.ReactNode = node => node) => {
  const location = memoryLocation({ path: '/oauth/callback', record: true })
  render(
    wrapper(
      <Provider>
        <Router hook={location.hook}>
          <OAuthCallback />
        </Router>
      </Provider>,
    ),
  )
  return location
}

describe('OAuth callback provider lookup', () => {
  beforeEach(() => {
    state.providers = null
    oidc.clearPendingOIDCProvider.mockReset()
    oidc.completeOIDCRedirect.mockReset()
    oidc.pendingOIDCProviderID.mockReset().mockReturnValue('company_sso')
    completeOIDC.mockClear().mockResolvedValue({ ok: true })
  })

  it('preserves pending state when provider configuration could not be loaded', async () => {
    renderCallback()

    await screen.findByText('Sign-in options could not be loaded. Try again.')
    expect(oidc.clearPendingOIDCProvider).not.toHaveBeenCalled()
    expect(oidc.completeOIDCRedirect).not.toHaveBeenCalled()
  })

  // A server with zero providers is not a load failure — it must not tell the user to retry.
  it('clears pending state when the server reports no configured providers', async () => {
    state.providers = []

    renderCallback()

    await screen.findByText('This sign-in request is no longer available. Start again from the sign-in page.')
    expect(oidc.clearPendingOIDCProvider).toHaveBeenCalledOnce()
  })

  it('clears pending state for a provider that is no longer configured', async () => {
    state.providers = [{ ...companySSO, id: 'other_sso', displayName: 'Other SSO' }]

    renderCallback()

    await screen.findByText('This sign-in request is no longer available. Start again from the sign-in page.')
    expect(oidc.clearPendingOIDCProvider).toHaveBeenCalledOnce()
    expect(oidc.completeOIDCRedirect).not.toHaveBeenCalled()
  })

  it('sends the authorization code and PKCE values to the server completion endpoint', async () => {
    state.providers = [companySSO]
    oidc.completeOIDCRedirect.mockResolvedValue(authorization)

    renderCallback()

    await vi.waitFor(() => expect(completeOIDC.mock.calls[0]?.[2]).toEqual({ provider: companySSO, ...authorization }))
  })

  it('lands the signed-in user on the app once the exchange succeeds', async () => {
    state.providers = [companySSO]
    oidc.completeOIDCRedirect.mockResolvedValue(authorization)

    const location = renderCallback()

    await vi.waitFor(() => expect(location.history.at(-1)).toBe('/'))
  })

  it('shows the error the exchange returned rather than navigating', async () => {
    state.providers = [companySSO]
    oidc.completeOIDCRedirect.mockResolvedValue(authorization)
    completeOIDC.mockResolvedValue({ ok: false, error: 'Invalid or expired Company SSO sign-in. Try again.' })

    const location = renderCallback()

    await screen.findByText('Invalid or expired Company SSO sign-in. Try again.')
    expect(location.history.at(-1)).toBe('/oauth/callback')
  })

  // An authorization code is single-use and readSigninResponseState consumes the stored state, so a
  // second effect pass would fail a sign-in that had already succeeded.
  it('completes once under StrictMode double-invocation', async () => {
    state.providers = [companySSO]
    oidc.completeOIDCRedirect.mockResolvedValue(authorization)

    renderCallback(node => <StrictMode>{node}</StrictMode>)

    await vi.waitFor(() => expect(completeOIDC).toHaveBeenCalledOnce())
    expect(oidc.completeOIDCRedirect).toHaveBeenCalledOnce()
  })
})
