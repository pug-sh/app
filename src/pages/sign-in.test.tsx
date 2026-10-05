import { create } from '@bufbuild/protobuf'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import {
  type AuthProviderConfig,
  AuthProviderConfigSchema,
  AuthProviderType,
  type DiscoverSignInResponse,
  DiscoverSignInResponseSchema,
  SSORequiredSchema,
} from '@/api/genproto/public/auth/v1/auth_pb'
import type { AuthResult } from '@/auth/auth.atoms'
import type { OIDCSignInOptions } from '@/auth/oidc'
import { ssoBlockAtom } from '@/auth/sso-required'

const state = vi.hoisted(() => ({
  providers: null as AuthProviderConfig[] | null,
  linkResult: { ok: true } as AuthResult,
  discovery: null as DiscoverSignInResponse | null,
}))
const requestMagicLink = vi.hoisted(() => vi.fn())
const discover = vi.hoisted(() => vi.fn(async () => state.discovery))
const renderedButton = vi.hoisted(() => vi.fn())

vi.mock('@/auth/auth.atoms', async () => {
  const { atom } = await import('jotai')
  return {
    authProvidersAtom: atom(() => state.providers),
    demoEnabledAtom: atom(false),
    discoverSignInAtom: atom(null, () => discover()),
    requestMagicLinkAtom: atom(null, async (_get, _set, input: { email: string }) => {
      requestMagicLink(input)
      return state.linkResult
    }),
    signInAtom: atom(null, async () => ({ ok: true })),
  }
})

vi.mock('@/auth/oidc-sign-in-button', () => ({
  OIDCSignInButton: (props: {
    provider: AuthProviderConfig
    options?: OIDCSignInOptions
    onError: (message: string) => void
  }) => {
    renderedButton(props)
    return (
      <button type="button" data-testid="oidc-provider">
        {props.provider.displayName}
      </button>
    )
  },
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
    expect(screen.getAllByTestId('oidc-provider').map(button => button.textContent)).toEqual(['Google', 'Company SSO'])
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
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('acme.com accounts sign in with Google')).toBeTruthy()
    expect(screen.getByText('Passwords and email links are turned off for acme.com.')).toBeTruthy()
    expect(screen.getAllByTestId('oidc-provider').map(button => button.textContent)).toEqual(['Google'])
    expect(screen.queryByText('Check your inbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  // The transport sets this when RefreshSession refuses a session that didn't start through SSO.
  it('says why a session ended', async () => {
    const store = createStore()
    store.set(ssoBlockAtom, { detail: acmeRequiresSSO, sessionEnded: true })
    renderSignIn(store)

    expect(await screen.findByText('SSO is now required for acme.com. Sign in again to continue.')).toBeTruthy()
  })
})

describe('email-first sign-in', () => {
  const acmeSSO = create(AuthProviderConfigSchema, {
    connectionId: 'd3uqa6s1m7j9b2c4e5f0',
    type: AuthProviderType.OIDC,
    displayName: 'Acme SSO',
    issuerUrl: 'https://acme.okta.com',
  })
  const google = create(AuthProviderConfigSchema, {
    id: 'google',
    type: AuthProviderType.OIDC,
    displayName: 'Google',
    issuerUrl: 'https://accounts.google.com',
  })

  beforeEach(() => {
    state.providers = []
    state.linkResult = { ok: true }
    state.discovery = null
    requestMagicLink.mockReset()
    renderedButton.mockReset()
  })

  const continueAs = async (email: string) => {
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: email } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  }

  it('sends a domain with a connection to it, and keeps the link as the other way in', async () => {
    state.discovery = create(DiscoverSignInResponseSchema, { domain: 'acme.com', providers: [acmeSSO] })
    renderSignIn()

    await continueAs('bob@acme.com')

    expect((await screen.findByTestId('oidc-provider')).textContent).toBe('Acme SSO')
    expect(renderedButton).toHaveBeenLastCalledWith(
      expect.objectContaining({ options: { loginHint: 'bob@acme.com', domain: 'acme.com' } }),
    )
    expect(screen.getByText('acme.com accounts sign in through SSO.')).toBeTruthy()
    expect(requestMagicLink).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Email me a link instead' }))
    expect(await screen.findByText('Check your inbox')).toBeTruthy()
    expect(requestMagicLink).toHaveBeenCalledWith({ email: 'bob@acme.com' })
  })

  // The SSO_REQUIRED refusal stays as the server's backstop, but the page needn't wait for it.
  it('goes straight to SSO when the domain requires it', async () => {
    state.discovery = create(DiscoverSignInResponseSchema, {
      domain: 'acme.com',
      providers: [google],
      requireSso: true,
    })
    renderSignIn()

    await continueAs('bob@acme.com')

    expect((await screen.findByTestId('oidc-provider')).textContent).toBe('Google')
    expect(screen.queryByRole('button', { name: 'Email me a link instead' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign in with password' })).toBeNull()
    expect(requestMagicLink).not.toHaveBeenCalled()
  })

  // Google is listed for every domain without a provider of its own, gmail.com included.
  it('sends the link when the domain has neither', async () => {
    state.discovery = create(DiscoverSignInResponseSchema, { domain: 'gmail.com', providers: [google] })
    renderSignIn()

    await continueAs('jane@gmail.com')

    expect(await screen.findByText('Check your inbox')).toBeTruthy()
    expect(requestMagicLink).toHaveBeenCalledWith({ email: 'jane@gmail.com' })
  })

  it("sends the link when the server can't say", async () => {
    renderSignIn()

    await continueAs('bob@acme.com')

    expect(await screen.findByText('Check your inbox')).toBeTruthy()
  })

  it('drops the SSO step when the email changes', async () => {
    state.discovery = create(DiscoverSignInResponseSchema, { domain: 'acme.com', providers: [acmeSSO] })
    renderSignIn()

    await continueAs('bob@acme.com')
    await screen.findByTestId('oidc-provider')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bob@globex.com' } })

    expect(screen.queryByTestId('oidc-provider')).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('drops the answer for an email edited while it was asked', async () => {
    let answer: (discovery: DiscoverSignInResponse) => void = () => {}
    discover.mockReturnValueOnce(new Promise(resolve => (answer = resolve)))
    renderSignIn()

    await continueAs('bob@acme.com')
    await waitFor(() => expect(discover).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bob@globex.com' } })
    await act(async () => answer(create(DiscoverSignInResponseSchema, { domain: 'acme.com', providers: [google] })))

    expect(requestMagicLink).not.toHaveBeenCalled()
    expect(screen.queryByText('Check your inbox')).toBeNull()
  })

  it("keeps a step button's error out of click autocapture once the step is gone", async () => {
    state.discovery = create(DiscoverSignInResponseSchema, { domain: 'acme.com', providers: [acmeSSO] })
    renderSignIn()

    await continueAs('bob@acme.com')
    await screen.findByTestId('oidc-provider')
    act(() => renderedButton.mock.lastCall?.[0].onError('Acme SSO sign-in could not be started. Try again.'))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bob@globex.com' } })

    const message = screen.getByText('Acme SSO sign-in could not be started. Try again.')
    expect(message.closest('[data-pug-no-capture]')).not.toBeNull()
  })
})
