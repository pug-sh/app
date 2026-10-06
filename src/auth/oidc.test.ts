import { create } from '@bufbuild/protobuf'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProviderConfigSchema, AuthProviderType } from '@/api/genproto/public/auth/v1/auth_pb'

const oidc = vi.hoisted(() => ({
  signinRedirect: vi.fn(),
  readSigninResponseState: vi.fn(),
  clearStaleState: vi.fn(),
  managerSettings: vi.fn(),
}))

vi.mock('oidc-client-ts', () => ({
  WebStorageStateStore: class {},
  OidcClient: class {
    readSigninResponseState = oidc.readSigninResponseState
  },
  UserManager: class {
    signinRedirect = oidc.signinRedirect
    clearStaleState = oidc.clearStaleState
    constructor(settings: unknown) {
      oidc.managerSettings(settings)
    }
  },
}))

import {
  clearPendingOIDCProvider,
  completeOIDCRedirect,
  pendingOIDCConnection,
  pendingOIDCInviteToken,
  pendingOIDCProviderID,
  startOIDCSignIn,
} from './oidc'

const providerInit = {
  id: 'company_sso',
  displayName: 'Company SSO',
  clientId: 'pug',
  issuerUrl: 'https://login.example.com/realms/main',
  scopes: ['openid', 'profile', 'email'],
}
const provider = create(AuthProviderConfigSchema, providerInit)

// Sized to the CompleteOIDCSignInRequest constraints (code_verifier min_len 43, nonce min_len 16).
const codeVerifier = 'a'.repeat(43)
const nonce = '2ec3f0a1-6b1e-4f0e-9d0a-6a1c3b5d7e9f'

const connection = create(AuthProviderConfigSchema, {
  connectionId: 'd3uqa6s1m7j9b2c4e5f0',
  type: AuthProviderType.OIDC,
  displayName: 'Acme SSO',
  clientId: 'acme-client',
  issuerUrl: 'https://acme.okta.com',
  scopes: ['openid', 'profile', 'email'],
})
const connectionCallback = `/oauth/callback/${connection.connectionId}`

const storedState = (redirectPath = '/oauth/callback') => ({
  authority: provider.issuerUrl,
  client_id: provider.clientId,
  redirect_uri: `${window.location.origin}${redirectPath}`,
  code_verifier: codeVerifier,
  nonce,
})

const connectionState = () => ({
  ...storedState(connectionCallback),
  authority: connection.issuerUrl,
  client_id: connection.clientId,
})

const landOn = (path: string) => window.history.replaceState(null, '', `${path}?code=authorization-code&state=s`)

describe('OIDC redirect lifecycle', () => {
  beforeEach(() => {
    sessionStorage.clear()
    landOn('/oauth/callback')
    oidc.signinRedirect.mockReset()
    oidc.readSigninResponseState.mockReset()
    oidc.clearStaleState.mockReset().mockResolvedValue(undefined)
    oidc.managerSettings.mockReset()
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
    sessionStorage.setItem('pug.oidc.pending-invite', 'invite-token')

    await expect(completeOIDCRedirect(provider)).resolves.toEqual({
      code: 'authorization-code',
      codeVerifier,
      redirectURI: `${window.location.origin}/oauth/callback`,
      nonce,
    })
    expect(pendingOIDCProviderID()).toBe('')
    expect(pendingOIDCInviteToken()).toBe('')
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

  it('narrows Google to the domain and hints the account', async () => {
    oidc.signinRedirect.mockResolvedValue(undefined)
    const google = create(AuthProviderConfigSchema, { ...providerInit, issuerUrl: 'https://accounts.google.com' })

    await startOIDCSignIn(google, { loginHint: 'bob@acme.com', domain: 'acme.com' })
    await startOIDCSignIn(provider, { loginHint: 'bob@acme.com', domain: 'acme.com' })

    const [googleArgs, otherArgs] = oidc.signinRedirect.mock.calls.map(call => call[0])
    expect(googleArgs.login_hint).toBe('bob@acme.com')
    expect(googleArgs.extraQueryParams).toEqual({ hd: 'acme.com' })
    // hd is Google's own parameter; another provider only gets the standard hint.
    expect(otherArgs.login_hint).toBe('bob@acme.com')
    expect(otherArgs.extraQueryParams).toBeUndefined()
  })

  it("starts a connection's sign-in on its own callback path and keeps its config for the return", async () => {
    oidc.signinRedirect.mockResolvedValue(undefined)
    sessionStorage.setItem('pug.oidc.pending-provider', 'google')

    await startOIDCSignIn(connection)

    expect(oidc.managerSettings.mock.calls[0][0]).toMatchObject({
      authority: 'https://acme.okta.com',
      client_id: 'acme-client',
      redirect_uri: `${window.location.origin}${connectionCallback}`,
      scope: 'openid profile email',
    })
    expect(pendingOIDCConnection()).toEqual(connection)
    expect(pendingOIDCProviderID()).toBe('')
  })

  it("returns a connection's code from its own callback path", async () => {
    landOn(connectionCallback)
    oidc.readSigninResponseState.mockResolvedValue({
      response: { code: 'authorization-code', error: null },
      state: connectionState(),
    })
    await startOIDCSignIn(connection)

    await expect(completeOIDCRedirect(connection)).resolves.toMatchObject({
      code: 'authorization-code',
      redirectURI: `${window.location.origin}${connectionCallback}`,
    })
    expect(pendingOIDCConnection()).toBeNull()
  })

  // OAuth mix-up: the code came from the provider whose path it landed on.
  it.each([
    ['a connection', connection, connectionState(), '/oauth/callback'],
    ['a provider', provider, storedState(), connectionCallback],
  ])('refuses a code for %s that lands on another callback path', async (_kind, started, state, landedOn) => {
    landOn(landedOn)
    oidc.readSigninResponseState.mockResolvedValue({ response: { code: 'authorization-code', error: null }, state })

    await expect(completeOIDCRedirect(started)).rejects.toThrow(
      'OIDC response did not match the original sign-in request',
    )
  })

  it('carries an invite token for that one attempt only', async () => {
    oidc.signinRedirect.mockResolvedValue(undefined)

    await startOIDCSignIn(provider, { inviteToken: 'invite-token' })
    expect(pendingOIDCInviteToken()).toBe('invite-token')

    await startOIDCSignIn(provider)
    expect(pendingOIDCInviteToken()).toBe('')

    await startOIDCSignIn(provider, { inviteToken: 'invite-token' })
    clearPendingOIDCProvider()
    expect(pendingOIDCInviteToken()).toBe('')
  })
})
