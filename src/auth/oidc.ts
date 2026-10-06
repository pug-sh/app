import { fromJsonString, toJsonString } from '@bufbuild/protobuf'
import { OidcClient, UserManager, type UserManagerSettings, WebStorageStateStore } from 'oidc-client-ts'
import { type AuthProviderConfig, AuthProviderConfigSchema } from '@/api/genproto/public/auth/v1/auth_pb'

const callbackPath = '/oauth/callback'
const pendingProviderKey = 'pug.oidc.pending-provider'
const pendingConnectionKey = 'pug.oidc.pending-connection'
const pendingInviteKey = 'pug.oidc.pending-invite'

// Keyed on the issuer, not the id — the id is operator-chosen and can be anything.
export const isGoogleProvider = (provider: AuthProviderConfig) =>
  provider.issuerUrl.startsWith('https://accounts.google.com')

// A connection's id is unset; the prefix keeps its key apart from provider ids.
export const providerKey = (provider: AuthProviderConfig) =>
  provider.connectionId ? `connection:${provider.connectionId}` : provider.id

// Its own path per connection, so a code landing on another provider's path is caught as an OAuth mix-up.
export const connectionRedirectURI = (connectionId: string) =>
  `${window.location.origin}${callbackPath}/${connectionId}`

const redirectURIFor = (provider: AuthProviderConfig) => {
  if (provider.connectionId) return connectionRedirectURI(provider.connectionId)
  return `${window.location.origin}${callbackPath}`
}

// loginHint and domain only steer the provider's account picker; the server checks the token.
// inviteToken rides this one attempt, so a later sign-in in the tab can't carry an old invite.
export type OIDCSignInOptions = { loginHint?: string; domain?: string; inviteToken?: string }

// Annotated: without a target type the object literal gets no excess-property check, so a typo in
// any optional key silently falls back to the library default (scope → "openid", store → local).
const settingsFor = (provider: AuthProviderConfig): UserManagerSettings => ({
  authority: provider.issuerUrl,
  client_id: provider.clientId,
  redirect_uri: redirectURIFor(provider),
  response_type: 'code',
  scope: provider.scopes.join(' '),
  loadUserInfo: false,
  automaticSilentRenew: false,
  stateStore: new WebStorageStateStore({ store: window.sessionStorage, prefix: 'pug.oidc.state.' }),
})

const managerFor = (provider: AuthProviderConfig) => new UserManager(settingsFor(provider))
const clientFor = (provider: AuthProviderConfig) => new OidcClient(settingsFor(provider))

export const startOIDCSignIn = async (
  provider: AuthProviderConfig,
  { loginHint, domain, inviteToken }: OIDCSignInOptions = {},
) => {
  // GetAuthConfig doesn't list connections, so the callback can only read one's config from here.
  if (provider.connectionId) {
    sessionStorage.setItem(pendingConnectionKey, toJsonString(AuthProviderConfigSchema, provider))
    sessionStorage.removeItem(pendingProviderKey)
  } else {
    sessionStorage.setItem(pendingProviderKey, provider.id)
    sessionStorage.removeItem(pendingConnectionKey)
  }
  if (inviteToken) sessionStorage.setItem(pendingInviteKey, inviteToken)
  else sessionStorage.removeItem(pendingInviteKey)
  try {
    const manager = managerFor(provider)
    await manager.clearStaleState()
    await manager.signinRedirect({
      nonce: crypto.randomUUID(),
      login_hint: loginHint,
      // Google's hosted-domain hint.
      extraQueryParams: domain && isGoogleProvider(provider) ? { hd: domain } : undefined,
    })
  } catch (error) {
    clearPendingOIDCProvider()
    throw error
  }
}

export const pendingOIDCProviderID = () => sessionStorage.getItem(pendingProviderKey) ?? ''

export const pendingOIDCConnection = () => {
  const stored = sessionStorage.getItem(pendingConnectionKey)
  if (!stored) return null
  try {
    return fromJsonString(AuthProviderConfigSchema, stored)
  } catch (error) {
    console.error('Discarding an unreadable pending SSO connection', error)
    return null
  }
}

// Read it before completeOIDCRedirect, which clears it along with the provider.
export const pendingOIDCInviteToken = () => sessionStorage.getItem(pendingInviteKey) ?? ''

export const clearPendingOIDCProvider = () => {
  sessionStorage.removeItem(pendingProviderKey)
  sessionStorage.removeItem(pendingConnectionKey)
  sessionStorage.removeItem(pendingInviteKey)
}

export const completeOIDCRedirect = async (provider: AuthProviderConfig) => {
  const expectedRedirectURI = redirectURIFor(provider)
  try {
    const { state, response } = await clientFor(provider).readSigninResponseState(window.location.href, true)
    if (response.error) throw new Error('The identity provider rejected the sign-in request')
    if (!response.code || !state.code_verifier || !state.nonce) {
      throw new Error('OIDC response did not include the required authorization values')
    }
    // The library reads only the query, so the path the code landed on is checked here.
    const landedOn = `${window.location.origin}${window.location.pathname}`
    if (
      state.authority !== provider.issuerUrl ||
      state.client_id !== provider.clientId ||
      state.redirect_uri !== expectedRedirectURI ||
      landedOn !== expectedRedirectURI
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
