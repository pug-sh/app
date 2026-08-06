import { OidcClient, UserManager, WebStorageStateStore } from 'oidc-client-ts'
import type { AuthProviderConfig } from '@/api/genproto/public/auth/v1/auth_pb'

const callbackPath = '/oauth/callback'
const pendingProviderKey = 'pug.oidc.pending-provider'

const settingsFor = (provider: AuthProviderConfig) => ({
  authority: provider.issuerUrl,
  client_id: provider.clientId,
  redirect_uri: `${window.location.origin}${callbackPath}`,
  response_type: 'code',
  scope: provider.scopes.join(' '),
  loadUserInfo: false,
  automaticSilentRenew: false,
  stateStore: new WebStorageStateStore({ store: window.sessionStorage, prefix: 'pug.oidc.state.' }),
})

const managerFor = (provider: AuthProviderConfig) => new UserManager(settingsFor(provider))
const clientFor = (provider: AuthProviderConfig) => new OidcClient(settingsFor(provider))

export const startOIDCSignIn = async (provider: AuthProviderConfig) => {
  sessionStorage.setItem(pendingProviderKey, provider.id)
  try {
    const manager = managerFor(provider)
    await manager.clearStaleState()
    await manager.signinRedirect({ nonce: crypto.randomUUID() })
  } catch (error) {
    sessionStorage.removeItem(pendingProviderKey)
    throw error
  }
}

export const pendingOIDCProviderID = () => sessionStorage.getItem(pendingProviderKey) ?? ''

export const clearPendingOIDCProvider = () => sessionStorage.removeItem(pendingProviderKey)

export const completeOIDCRedirect = async (provider: AuthProviderConfig) => {
  const expectedRedirectURI = `${window.location.origin}${callbackPath}`
  try {
    const { state, response } = await clientFor(provider).readSigninResponseState(window.location.href, true)
    if (response.error) throw new Error('The identity provider rejected the sign-in request')
    if (!response.code || !state.code_verifier || !state.nonce) {
      throw new Error('OIDC response did not include the required authorization values')
    }
    if (
      state.authority !== provider.issuerUrl ||
      state.client_id !== provider.clientId ||
      state.redirect_uri !== expectedRedirectURI
    ) {
      throw new Error('OIDC response did not match the original sign-in request')
    }
    return {
      code: response.code,
      codeVerifier: state.code_verifier,
      redirectURI: state.redirect_uri,
      nonce: state.nonce,
    }
  } finally {
    clearPendingOIDCProvider()
  }
}
