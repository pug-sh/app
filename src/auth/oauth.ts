import { Code, ConnectError } from '@connectrpc/connect'

const FALLBACK = 'Could not sign you in. Try again from the sign-in page.'

// The backend puts its reason in a google.rpc.ErrorInfo detail, not a trailer, and that proto
// isn't generated here — so map on the code, which separates the cases anyway.
export function mapOAuthConnectError(error: unknown, displayName: string) {
  if (!(error instanceof ConnectError)) {
    console.error('OIDC sign-in failed', error)
    return FALLBACK
  }

  // Expected — an expired, reused or replayed authorization code. Not worth logging.
  if (error.code === Code.Unauthenticated) return `Invalid or expired ${displayName} sign-in. Try again.`
  if (error.code === Code.Unavailable) return `${displayName} sign-in is temporarily unavailable.`
  if (error.code === Code.InvalidArgument) return 'Sign-in failed. Try again.'

  // The raw message is developer-facing (always prefixed with the code) — log it, never show it.
  console.error('Unmapped OAuth error', { code: error.code, message: error.message })
  return FALLBACK
}
