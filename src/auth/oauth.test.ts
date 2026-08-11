import { Code, ConnectError } from '@connectrpc/connect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mapOAuthConnectError } from './oauth'

const FALLBACK = 'Could not sign you in. Try again from the sign-in page.'
// Always prefixed with the code by connect, and developer-facing — it must never reach the screen.
const RAW = '[unauthenticated] oauth sign-in failed'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mapOAuthConnectError', () => {
  it('names the provider on a rejected credential and does not log it', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const copy = mapOAuthConnectError(new ConnectError(RAW, Code.Unauthenticated), 'Company SSO')

    expect(copy).toBe('Invalid or expired Company SSO sign-in. Try again.')
    // The routine failure of the flow — an expired or replayed code. Logging it would report every
    // ordinary sign-in slip as a defect.
    expect(logged).not.toHaveBeenCalled()
  })

  it('names the provider when the identity provider is unavailable', () => {
    expect(mapOAuthConnectError(new ConnectError(RAW, Code.Unavailable), 'Company SSO')).toBe(
      'Company SSO sign-in is temporarily unavailable.',
    )
  })

  it('stays generic on a rejected request', () => {
    expect(mapOAuthConnectError(new ConnectError(RAW, Code.InvalidArgument), 'Company SSO')).toBe(
      'Sign-in failed. Try again.',
    )
  })

  it('falls back and logs an unmapped code', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(mapOAuthConnectError(new ConnectError(RAW, Code.Internal), 'Company SSO')).toBe(FALLBACK)
    expect(logged).toHaveBeenCalled()
  })

  it('falls back and logs a non-Connect failure', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(mapOAuthConnectError(new TypeError('boom'), 'Company SSO')).toBe(FALLBACK)
    expect(logged).toHaveBeenCalled()
  })

  it('never surfaces the raw server message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const codes = [Code.Unauthenticated, Code.Unavailable, Code.InvalidArgument, Code.Internal]

    for (const code of codes) {
      expect(mapOAuthConnectError(new ConnectError(RAW, code), 'Company SSO')).not.toContain('oauth sign-in failed')
    }
  })
})
