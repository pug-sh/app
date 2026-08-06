import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthProviderConfig } from '@/api/genproto/public/auth/v1/auth_pb'

const oidc = vi.hoisted(() => ({
  signinRedirect: vi.fn(),
  signinRedirectCallback: vi.fn(),
  removeUser: vi.fn(),
}))

vi.mock('oidc-client-ts', () => ({
  InMemoryWebStorage: class {},
  WebStorageStateStore: class {},
  UserManager: class {
    signinRedirect = oidc.signinRedirect
    signinRedirectCallback = oidc.signinRedirectCallback
    removeUser = oidc.removeUser
  },
}))

import { completeOIDCRedirect, pendingOIDCProviderID, startOIDCSignIn } from './oidc'

const provider = {
  id: 'company_sso',
  displayName: 'Company SSO',
  clientId: 'pug',
  issuerUrl: 'https://login.example.com/realms/main',
  scopes: ['openid', 'profile', 'email'],
} as AuthProviderConfig

describe('OIDC redirect lifecycle', () => {
  beforeEach(() => {
    oidc.signinRedirect.mockReset()
    oidc.signinRedirectCallback.mockReset()
    oidc.removeUser.mockReset().mockResolvedValue(undefined)
  })

  it('clears the pending provider when starting the redirect fails', async () => {
    oidc.signinRedirect.mockRejectedValue(new Error('redirect failed'))

    await expect(startOIDCSignIn(provider)).rejects.toThrow('redirect failed')
    expect(pendingOIDCProviderID()).toBe('')
  })

  it('returns the ID token even when best-effort in-memory cleanup fails', async () => {
    oidc.signinRedirectCallback.mockResolvedValue({ id_token: 'verified-id-token' })
    oidc.removeUser.mockRejectedValue(new Error('cleanup failed'))
    sessionStorage.setItem('pug.oidc.pending-provider', provider.id)

    await expect(completeOIDCRedirect(provider)).resolves.toBe('verified-id-token')
    expect(pendingOIDCProviderID()).toBe('')
  })
})
