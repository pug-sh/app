import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { type AuthProviderConfig, AuthProviderType, SSORequiredSchema } from '@/api/genproto/public/auth/v1/auth_pb'
import type { AuthResult } from '@/auth/auth.atoms'

const state = vi.hoisted(() => ({ providers: null as AuthProviderConfig[] | null }))
const completeOIDC = vi.hoisted(() =>
  vi.fn(async (_get: unknown, _set: unknown, _input: unknown) => ({ ok: true }) as AuthResult),
)
const oidc = vi.hoisted(() => ({
  clearPendingOIDCProvider: vi.fn(),
  completeOIDCRedirect: vi.fn(),
  pendingOIDCProviderID: vi.fn(() => 'company_sso'),
  pendingOIDCInviteToken: vi.fn(() => ''),
  startOIDCSignIn: vi.fn(),
  isGoogleProvider: (provider: AuthProviderConfig) => provider.issuerUrl.startsWith('https://accounts.google.com'),
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
    oidc.pendingOIDCInviteToken.mockReset().mockReturnValue('')
    oidc.startOIDCSignIn.mockReset()
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

    await vi.waitFor(() =>
      expect(completeOIDC.mock.calls[0]?.[2]).toEqual({ provider: companySSO, ...authorization, inviteToken: '' }),
    )
  })

  it('sends the invite the sign-in was started for', async () => {
    state.providers = [companySSO]
    oidc.pendingOIDCInviteToken.mockReturnValue('invite-token')
    // Like the real one, which clears the pending invite along with the provider.
    oidc.completeOIDCRedirect.mockImplementation(async () => {
      oidc.pendingOIDCInviteToken.mockReturnValue('')
      return authorization
    })

    renderCallback()

    await vi.waitFor(() =>
      expect(completeOIDC.mock.calls[0]?.[2]).toMatchObject({ provider: companySSO, inviteToken: 'invite-token' }),
    )
  })

  // E.g. a personal Google account using a work address. The retry keeps the invite it was started for.
  it("offers the domain's providers again when the sign-in didn't prove the domain", async () => {
    const google = { ...companySSO, id: 'google', displayName: 'Google', issuerUrl: 'https://accounts.google.com' }
    state.providers = [google]
    oidc.pendingOIDCProviderID.mockReturnValue('google')
    oidc.pendingOIDCInviteToken.mockReturnValue('invite-token')
    oidc.completeOIDCRedirect.mockResolvedValue(authorization)
    completeOIDC.mockResolvedValue({
      ok: false,
      error: 'acme.com accounts sign in through SSO.',
      ssoRequired: create(SSORequiredSchema, { domain: 'acme.com', providers: [google] }),
    })

    renderCallback()

    expect(await screen.findByText('acme.com accounts sign in with Google')).toBeTruthy()
    expect(screen.getByText('Use your acme.com Google Workspace account.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(oidc.startOIDCSignIn).toHaveBeenCalledWith(expect.objectContaining({ id: 'google' }), {
      loginHint: undefined,
      domain: 'acme.com',
      inviteToken: 'invite-token',
    })
  })

  // E.g. cancelled at the provider. The invite link is still unused, so it can start the sign-in over.
  it('goes back to the invite when the sign-in fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    state.providers = [companySSO]
    oidc.pendingOIDCInviteToken.mockReturnValue('invite-token')
    oidc.completeOIDCRedirect.mockRejectedValue(new Error('The identity provider rejected the sign-in request'))

    const location = renderCallback()

    fireEvent.click(await screen.findByRole('button', { name: 'Back to your invite' }))
    expect(location.history.at(-1)).toBe('/magic-link?token=invite-token')
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
