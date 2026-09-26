import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AuthProviderConfig,
  AuthProviderType,
  type SSORequired,
  SSORequiredSchema,
} from '@/api/genproto/public/auth/v1/auth_pb'

const { completeOIDCSignIn, completeMagicLink, signInWithEmail, requestMagicLink } = vi.hoisted(() => ({
  completeOIDCSignIn: vi.fn(),
  completeMagicLink: vi.fn(),
  signInWithEmail: vi.fn(),
  requestMagicLink: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    authRPCAtom: atom({ completeOIDCSignIn, completeMagicLink, signInWithEmail, requestMagicLink }),
    customersRPCAtom: atom({ getMe: vi.fn() }),
  }
})

vi.mock('@/analytics/pug', () => ({ trackEvent: vi.fn() }))

const { completeMagicLinkAtom, completeOIDCAtom, requestMagicLinkAtom, signInAtom, signOutAtom } = await import(
  './auth.atoms'
)
const { ssoBlockAtom } = await import('./sso-required')
const { jwtAtom, refreshTokenAtom } = await import('./jwt.atoms')
const { bootstrapStatusAtom, joinedOrgIdsAtom } = await import('@/data/workspace.atoms')
const { isDemoSessionAtom } = await import('./demo')

const provider = {
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

const ssoRefused = (detail: SSORequired) =>
  new ConnectError('acme.com accounts sign in through SSO', Code.FailedPrecondition, undefined, [
    { desc: SSORequiredSchema, value: detail },
  ])

describe('completeOIDCAtom', () => {
  beforeEach(() => {
    localStorage.clear()
    completeOIDCSignIn.mockReset()
  })

  it('stores the issued session', async () => {
    completeOIDCSignIn.mockResolvedValue({ token: 'access-token', refreshToken: 'refresh-token', joinedOrgIds: [] })
    const store = createStore()

    await expect(store.set(completeOIDCAtom, { provider, ...authorization })).resolves.toEqual({ ok: true })

    expect(store.get(jwtAtom)).toBe('access-token')
    expect(store.get(refreshTokenAtom)).toBe('refresh-token')
    // Derived from the sign-in method — a real login must not raise the demo banner.
    expect(store.get(isDemoSessionAtom)).toBe(false)
  })

  it('records the orgs the sign-in joined', async () => {
    completeOIDCSignIn.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
      joinedOrgIds: ['org-acme', 'org-acme-eu'],
    })
    const store = createStore()

    await store.set(completeOIDCAtom, { provider, ...authorization })

    expect(store.get(joinedOrgIdsAtom)).toEqual(['org-acme', 'org-acme-eu'])
  })

  it('sends the provider id under its proto field name', async () => {
    completeOIDCSignIn.mockResolvedValue({ token: 'access-token', refreshToken: 'refresh-token', joinedOrgIds: [] })

    await createStore().set(completeOIDCAtom, { provider, ...authorization })

    expect(completeOIDCSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'company_sso',
        code: authorization.code,
        codeVerifier: authorization.codeVerifier,
        redirectUri: authorization.redirectURI,
        nonce: authorization.nonce,
      }),
    )
  })

  it('sends the invite and hands back an SSO refusal', async () => {
    const detail = create(SSORequiredSchema, { domain: 'acme.com' })
    completeOIDCSignIn.mockRejectedValue(ssoRefused(detail))
    const store = createStore()

    const result = await store.set(completeOIDCAtom, { provider, ...authorization, inviteToken: 'invite-token' })

    expect(completeOIDCSignIn).toHaveBeenCalledWith(expect.objectContaining({ inviteToken: 'invite-token' }))
    expect(result).toMatchObject({ ok: false, ssoRequired: { domain: 'acme.com' } })
    expect(store.get(refreshTokenAtom)).toBe('')
  })

  it('says the invite was sent to another address', async () => {
    completeOIDCSignIn.mockRejectedValue(new ConnectError('refused', Code.PermissionDenied))

    await expect(
      createStore().set(completeOIDCAtom, { provider, ...authorization, inviteToken: 'invite-token' }),
    ).resolves.toEqual({
      ok: false,
      error: 'This invite was sent to another email address. Open it again and sign in with that account.',
    })
  })

  // InvalidArgument is also an unverified email or a disabled provider, not only a dead invite.
  it("doesn't blame the invite for an invalid request", async () => {
    completeOIDCSignIn.mockRejectedValue(
      new ConnectError('email not verified by identity provider', Code.InvalidArgument),
    )

    await expect(
      createStore().set(completeOIDCAtom, { provider, ...authorization, inviteToken: 'invite-token' }),
    ).resolves.toEqual({ ok: false, error: 'Sign-in failed. Try again.' })
  })

  it('leaves no session behind when the exchange fails', async () => {
    completeOIDCSignIn.mockRejectedValue(new ConnectError('oauth sign-in failed', Code.Unauthenticated))
    const store = createStore()

    await expect(store.set(completeOIDCAtom, { provider, ...authorization })).resolves.toEqual({
      ok: false,
      error: 'Invalid or expired Company SSO sign-in. Try again.',
    })
    expect(store.get(refreshTokenAtom)).toBe('')
  })
})

describe('completeMagicLinkAtom', () => {
  // An invite link joins an org; bootstrap has to reopen on it even over a loaded workspace.
  it('records the org the invite joined and reopens the workspace on it', async () => {
    completeMagicLink.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
      joinedOrgIds: ['org-acme'],
    })
    const store = createStore()
    store.set(bootstrapStatusAtom, 'ready')

    await expect(store.set(completeMagicLinkAtom, { token: 'magic' })).resolves.toEqual({ ok: true })

    expect(store.get(joinedOrgIdsAtom)).toEqual(['org-acme'])
    expect(store.get(bootstrapStatusAtom)).toBe('loading-org')
  })

  it('leaves the workspace alone when the link joined nothing', async () => {
    completeMagicLink.mockResolvedValue({ token: 'access-token', refreshToken: 'refresh-token', joinedOrgIds: [] })
    const store = createStore()
    store.set(bootstrapStatusAtom, 'ready')

    await store.set(completeMagicLinkAtom, { token: 'magic' })

    expect(store.get(bootstrapStatusAtom)).toBe('ready')
  })

  // The server leaves the link unused, so the page can pass an invite's token on to SSO.
  it('hands back an SSO refusal', async () => {
    completeMagicLink.mockRejectedValue(ssoRefused(create(SSORequiredSchema, { domain: 'acme.com', invite: true })))

    await expect(createStore().set(completeMagicLinkAtom, { token: 'magic' })).resolves.toMatchObject({
      ok: false,
      ssoRequired: { domain: 'acme.com', invite: true },
    })
  })
})

describe('the sign-in form atoms', () => {
  const detail = create(SSORequiredSchema, { domain: 'acme.com' })

  it('hands back an SSO refusal for a password', async () => {
    signInWithEmail.mockRejectedValue(ssoRefused(detail))

    await expect(
      createStore().set(signInAtom, { email: 'bob@acme.com', password: 'correct-horse' }),
    ).resolves.toMatchObject({ ok: false, ssoRequired: { domain: 'acme.com' } })
  })

  it('hands back an SSO refusal for an email link', async () => {
    requestMagicLink.mockRejectedValue(ssoRefused(detail))

    await expect(createStore().set(requestMagicLinkAtom, { email: 'bob@acme.com' })).resolves.toMatchObject({
      ok: false,
      ssoRequired: { domain: 'acme.com' },
    })
  })
})

describe('signOutAtom', () => {
  it('drops an SSO block, so the next sign-in starts at the form', async () => {
    const store = createStore()
    store.set(ssoBlockAtom, { detail: create(SSORequiredSchema, { domain: 'acme.com' }), sessionEnded: true })

    await store.set(signOutAtom)

    expect(store.get(ssoBlockAtom)).toBeNull()
  })
})
