import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { type AuthProviderConfig, AuthProviderType } from '@/api/genproto/public/auth/v1/auth_pb'

const state = vi.hoisted(() => ({ providers: [] as AuthProviderConfig[] }))

vi.mock('@/auth/auth.atoms', async () => {
  const { atom } = await import('jotai')
  return {
    authProvidersAtom: atom(() => state.providers),
    demoEnabledAtom: atom(false),
    requestMagicLinkAtom: atom(null, async () => ({ ok: true })),
    signInAtom: atom(null, async () => ({ ok: true })),
  }
})

vi.mock('@/auth/oidc-sign-in-button', () => ({
  OIDCSignInButton: ({ provider }: { provider: AuthProviderConfig }) => (
    <button type="button" data-testid="oidc-provider">
      {provider.id}
    </button>
  ),
}))

const SignIn = (await import('./sign-in')).default

describe('configured external provider buttons', () => {
  beforeEach(() => {
    state.providers = []
  })

  it('renders Google and every other provider through the OIDC flow', () => {
    state.providers = [
      {
        id: 'google',
        type: AuthProviderType.OIDC,
        displayName: 'Google',
        clientId: 'google-client',
        issuerUrl: 'https://accounts.google.com',
        scopes: ['openid', 'profile', 'email'],
      } as AuthProviderConfig,
      {
        id: 'company_sso',
        type: AuthProviderType.OIDC,
        displayName: 'Company SSO',
        clientId: 'pug',
        issuerUrl: 'https://login.example.com',
        scopes: ['openid'],
      } as AuthProviderConfig,
    ]

    render(
      <Provider>
        <Router hook={memoryLocation({ path: '/' }).hook}>
          <SignIn />
        </Router>
      </Provider>,
    )

    expect(screen.getAllByTestId('oidc-provider')).toHaveLength(2)
    expect(screen.getAllByTestId('oidc-provider').map(button => button.textContent)).toEqual(['google', 'company_sso'])
  })
})
