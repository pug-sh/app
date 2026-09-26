import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import {
  type AuthProviderConfig,
  AuthProviderConfigSchema,
  AuthProviderType,
  SSORequiredSchema,
} from '@/api/genproto/public/auth/v1/auth_pb'
import type { AuthResult } from '@/auth/auth.atoms'
import { ssoBlockAtom } from '@/auth/sso-required'

const state = vi.hoisted(() => ({
  providers: null as AuthProviderConfig[] | null,
  linkResult: { ok: true } as AuthResult,
}))

vi.mock('@/auth/auth.atoms', async () => {
  const { atom } = await import('jotai')
  return {
    authProvidersAtom: atom(() => state.providers),
    demoEnabledAtom: atom(false),
    requestMagicLinkAtom: atom(null, async () => state.linkResult),
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

const renderSignIn = (store = createStore()) =>
  render(
    <Provider store={store}>
      <Router hook={memoryLocation({ path: '/' }).hook}>
        <SignIn />
      </Router>
    </Provider>,
  )

const acmeRequiresSSO = create(SSORequiredSchema, {
  domain: 'acme.com',
  providers: [
    create(AuthProviderConfigSchema, {
      id: 'google',
      type: AuthProviderType.OIDC,
      displayName: 'Google',
      issuerUrl: 'https://accounts.google.com',
    }),
    // A type this build can't drive, so the SSO screen drops it as the provider list does.
    create(AuthProviderConfigSchema, { id: 'mystery', type: AuthProviderType.UNSPECIFIED, displayName: 'Mystery' }),
  ],
})

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

describe('a domain that requires SSO', () => {
  beforeEach(() => {
    state.providers = []
    state.linkResult = { ok: true }
  })

  it('offers its providers instead of sending a link', async () => {
    state.linkResult = { ok: false, error: 'acme.com accounts sign in through SSO.', ssoRequired: acmeRequiresSSO }
    renderSignIn()

    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'bob@acme.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))

    expect(await screen.findByText('acme.com accounts sign in with Google')).toBeTruthy()
    expect(screen.getByText('Passwords and email links are turned off for acme.com.')).toBeTruthy()
    expect(screen.getAllByTestId('oidc-provider').map(button => button.textContent)).toEqual(['google'])
    expect(screen.queryByText('Check your inbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(await screen.findByRole('button', { name: 'Email me a sign-in link' })).toBeTruthy()
  })

  // The transport sets this when RefreshSession refuses a session that didn't start through SSO.
  it('says why a session ended', async () => {
    const store = createStore()
    store.set(ssoBlockAtom, { detail: acmeRequiresSSO, sessionEnded: true })
    renderSignIn(store)

    expect(await screen.findByText('SSO is now required for acme.com. Sign in again to continue.')).toBeTruthy()
  })
})
