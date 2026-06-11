import { Code, ConnectError } from '@connectrpc/connect'

export function googleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''
}

export function isGoogleOAuthEnabled() {
  return googleClientId().length > 0
}

export function mapOAuthConnectError(error: unknown, fallback: string) {
  if (!(error instanceof ConnectError)) return fallback
  if (error.message.trim()) return error.message

  const reason = error.metadata.get('reason') ?? error.metadata.get('x-reason-code')

  if (error.code === Code.InvalidArgument) {
    if (reason === 'INVALID_TOKEN') return 'Invalid or expired Google sign-in. Try again.'
    if (reason === 'OAUTH_PROVIDER_DISABLED') return 'Google sign-in is not enabled.'
    return 'Sign-in failed. Try again.'
  }
  if (error.code === Code.Unavailable) return 'Sign-in temporarily unavailable. Try again.'
  return fallback
}
