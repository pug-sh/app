import { Code, ConnectError } from '@connectrpc/connect'

export const oauthCallbackPath = '/oauth/callback'

export function oauthRedirectUri() {
  const override = import.meta.env.VITE_OAUTH_REDIRECT_URI
  if (override) return override
  return `${window.location.origin}${oauthCallbackPath}`
}

export function isGoogleOAuthEnabled() {
  const flag = import.meta.env.VITE_OAUTH_GOOGLE_ENABLED
  return flag !== 'false' && flag !== '0'
}

export function mapOAuthConnectError(error: unknown, fallback: string) {
  if (!(error instanceof ConnectError)) return fallback
  if (error.message.trim()) return error.message

  const reason = error.metadata.get('reason') ?? error.metadata.get('x-reason-code')

  if (error.code === Code.InvalidArgument) {
    if (reason === 'INVALID_TOKEN') return 'Invalid or expired sign-in session. Try again.'
    if (reason === 'OAUTH_PROVIDER_DISABLED') return 'Google sign-in is not enabled.'
    if (reason === 'OAUTH_EXCHANGE_INVALID') return 'Sign-in failed. Try again.'
    return 'Sign-in failed. Try again.'
  }
  if (error.code === Code.Unavailable && reason === 'OAUTH_EXCHANGE_FAILED') {
    return 'Sign-in temporarily unavailable. Try again.'
  }
  return fallback
}

export function googleOAuthRedirectError(error: string, description?: string | null) {
  if (error === 'access_denied') return 'Google sign-in was cancelled.'
  if (description?.trim()) return description.trim()
  return 'Google sign-in could not be completed. Try again.'
}
