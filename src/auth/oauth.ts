import { Code, ConnectError } from '@connectrpc/connect'

export function googleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''
}

export function isGoogleOAuthEnabled() {
  return googleClientId().length > 0
}

// Failure reasons the backend sets on the error trailer; mirror the reason codes emitted by
// the pug auth handler for public.auth.v1 CompleteOAuthSignIn — keep these in sync with it.
const OAUTH_REASON_INVALID_TOKEN = 'INVALID_TOKEN'
const OAUTH_REASON_PROVIDER_DISABLED = 'OAUTH_PROVIDER_DISABLED'

export function mapOAuthConnectError(error: unknown, fallback: string) {
  if (!(error instanceof ConnectError)) return fallback

  // The reason rides on whichever trailer the backend set: 'reason' is canonical,
  // 'x-reason-code' is the legacy/alternate key.
  const reason = error.metadata.get('reason') ?? error.metadata.get('x-reason-code')

  // Map known reasons and codes to curated copy. The raw ConnectError message is developer-
  // facing (always prefixed with the code) — log it, never show it to the user.
  if (reason === OAUTH_REASON_INVALID_TOKEN) return 'Invalid or expired Google sign-in. Try again.'
  if (reason === OAUTH_REASON_PROVIDER_DISABLED) {
    // Frontend has a client ID but the backend doesn't — a config mismatch, not a user error.
    console.error('OAuth provider disabled server-side despite client ID configured')
    return 'Google sign-in is temporarily unavailable.'
  }
  if (error.code === Code.InvalidArgument) return 'Sign-in failed. Try again.'
  if (error.code === Code.Unavailable) return 'Sign-in temporarily unavailable. Try again.'

  // Unmapped: keep the technical detail in the console for debugging, show the generic fallback.
  console.error('Unmapped OAuth error', { code: error.code, reason, message: error.message })
  return fallback
}
