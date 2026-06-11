import { Code, ConnectError } from '@connectrpc/connect'

export function googleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''
}

export function isGoogleOAuthEnabled() {
  return googleClientId().length > 0
}

export function mapOAuthConnectError(error: unknown, fallback: string) {
  if (!(error instanceof ConnectError)) return fallback

  // Backend sends the reason under either header depending on the proxy in front.
  const reason = error.metadata.get('reason') ?? error.metadata.get('x-reason-code')

  // Check known reasons before the raw server message, which is often too technical to show.
  if (reason === 'INVALID_TOKEN') return 'Invalid or expired Google sign-in. Try again.'
  if (reason === 'OAUTH_PROVIDER_DISABLED') {
    // Frontend has a client ID but the backend doesn't — a config mismatch, not a user error.
    console.error('OAuth provider disabled server-side despite client ID configured')
    return 'Google sign-in is temporarily unavailable.'
  }

  if (error.message.trim()) return error.message
  if (error.code === Code.InvalidArgument) return 'Sign-in failed. Try again.'
  if (error.code === Code.Unavailable) return 'Sign-in temporarily unavailable. Try again.'
  return fallback
}
