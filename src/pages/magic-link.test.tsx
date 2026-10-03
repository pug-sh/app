import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { AuthProviderConfigSchema, AuthProviderType, SSORequiredSchema } from '@/api/genproto/public/auth/v1/auth_pb'
import type { AuthResult } from '@/auth/auth.atoms'

const state = vi.hoisted(() => ({ result: { ok: true } as AuthResult }))
const startOIDCSignIn = vi.hoisted(() => vi.fn())

vi.mock('@/auth/auth.atoms', async () => {
  const { atom } = await import('jotai')
  return { completeMagicLinkAtom: atom(null, async () => state.result) }
})

vi.mock('@/auth/oidc', async importOriginal => ({
  ...(await importOriginal<typeof import('@/auth/oidc')>()),
  startOIDCSignIn,
}))

const MagicLink = (await import('./magic-link')).default

const google = create(AuthProviderConfigSchema, {
  id: 'google',
  type: AuthProviderType.OIDC,
  displayName: 'Google',
  issuerUrl: 'https://accounts.google.com',
})

const refusedBySSO = (invite: boolean): AuthResult => ({
  ok: false,
  error: 'acme.com accounts sign in through SSO.',
  ssoRequired: create(SSORequiredSchema, { domain: 'acme.com', providers: [google], invite }),
})

const renderMagicLink = () => {
  window.history.replaceState(null, '', '/magic-link?token=link-token')
  render(
    <Provider>
      <Router hook={memoryLocation({ path: '/magic-link' }).hook}>
        <MagicLink />
      </Router>
    </Provider>,
  )
}

describe('a link whose domain requires SSO', () => {
  beforeEach(() => {
    startOIDCSignIn.mockReset()
  })

  it('accepts an invite through SSO instead', async () => {
    state.result = refusedBySSO(true)
    renderMagicLink()

    expect(await screen.findByText('Sign in to accept your invite.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))

    expect(startOIDCSignIn).toHaveBeenCalledWith(expect.objectContaining({ id: 'google' }), {
      loginHint: undefined,
      domain: 'acme.com',
      inviteToken: 'link-token',
    })
  })

  it('sends a sign-in link to SSO without its token', async () => {
    state.result = refusedBySSO(false)
    renderMagicLink()

    expect(await screen.findByText('Email links are turned off for acme.com.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))

    expect(startOIDCSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'google' }),
      expect.objectContaining({ inviteToken: undefined }),
    )
  })
})
