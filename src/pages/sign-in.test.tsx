import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { type AuthProviderConfig, AuthProviderType } from '@/api/genproto/public/auth/v1/auth_pb'

const state = vi.hoisted(() => ({ providers: null as AuthProviderConfig[] | null }))

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

const renderSignIn = () =>
  render(
    <Provider>
      <Router hook={memoryLocation({ path: '/' }).hook}>
        <SignIn />
      </Router>
    </Provider>,
  )

describe('configured external provider buttons', () => {
  beforeEach(() => {
    state.providers = null
  })

  it('renders Google and every other provider through the OIDC flow', async () => {
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

    renderSignIn()

    expect(await screen.findAllByTestId('oidc-provider')).toHaveLength(2)
    expect(screen.getAllByTestId('oidc-provider').map(button => button.textContent)).toEqual(['google', 'company_sso'])
  })

  // The gate has to count the providers it will actually render, or a type this build can't drive
  // leaves an empty block under a divider dividing nothing.
  it('renders no provider block when nothing is drivable', async () => {
    state.providers = [
      {
        id: 'mystery',
        type: AuthProviderType.UNSPECIFIED,
        displayName: 'Mystery',
        clientId: 'pug',
        issuerUrl: 'https://login.example.com',
        scopes: ['openid'],
      } as AuthProviderConfig,
    ]

    renderSignIn()

    await screen.findByText('Sign in to Pug')
    expect(screen.queryByTestId('oidc-provider')).toBeNull()
    expect(screen.queryByText('or continue with email')).toBeNull()
  })

  // A failed GetAuthConfig must not take email sign-in down with it.
  it('still offers email sign-in when provider config could not be loaded', async () => {
    renderSignIn()

    await screen.findByText('Sign in to Pug')
    expect(screen.queryByTestId('oidc-provider')).toBeNull()
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeTruthy()
  })
})
