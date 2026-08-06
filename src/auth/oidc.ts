import { InMemoryWebStorage, UserManager, WebStorageStateStore } from 'oidc-client-ts'
import type { AuthProviderConfig } from '@/api/genproto/public/auth/v1/auth_pb'

const callbackPath = '/oauth/callback'
const pendingProviderKey = 'pug.oidc.pending-provider'

const managerFor = (provider: AuthProviderConfig) =>
  new UserManager({
    authority: provider.issuerUrl,
    client_id: provider.clientId,
    redirect_uri: `${window.location.origin}${callbackPath}`,
    response_type: 'code',
    scope: provider.scopes.join(' '),
    loadUserInfo: false,
    automaticSilentRenew: false,
    stateStore: new WebStorageStateStore({ store: window.sessionStorage, prefix: 'pug.oidc.state.' }),
    // The authorization request state must survive the redirect, but provider
    // access/refresh tokens do not. Keep the returned User only in memory long
    // enough to extract its ID token for Pug's server-side verification.
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage(), prefix: 'pug.oidc.user.' }),
  })

export const startOIDCSignIn = async (provider: AuthProviderConfig) => {
  sessionStorage.setItem(pendingProviderKey, provider.id)
  try {
    await managerFor(provider).signinRedirect()
  } catch (error) {
    sessionStorage.removeItem(pendingProviderKey)
    throw error
  }
}

export const pendingOIDCProviderID = () => sessionStorage.getItem(pendingProviderKey) ?? ''

export const clearPendingOIDCProvider = () => sessionStorage.removeItem(pendingProviderKey)

export const completeOIDCRedirect = async (provider: AuthProviderConfig) => {
  const manager = managerFor(provider)
  try {
    const user = await manager.signinRedirectCallback()
    if (!user.id_token) throw new Error('OIDC response did not include an ID token')
    return user.id_token
  } finally {
    clearPendingOIDCProvider()
    // The returned User is held in an in-memory store, so cleanup is best-effort:
    // a cleanup failure must not discard an ID token that was already verified by
    // oidc-client-ts and is still destined for server-side verification by Pug.
    await manager.removeUser().catch(() => undefined)
  }
}
