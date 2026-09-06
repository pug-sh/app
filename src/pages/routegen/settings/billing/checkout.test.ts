import { beforeEach, describe, expect, it } from 'vitest'
import { clearCheckoutPending, markCheckoutPending, takeCheckoutPending } from './checkout'

const KEY = 'pug:billingCheckoutPending'

beforeEach(() => sessionStorage.clear())

describe('the pending checkout', () => {
  it('carries the signature and the session id across the provider redirect', () => {
    markCheckoutPending({ signature: 'growth:2000', sessionId: 'cs_1' })
    expect(takeCheckoutPending()).toEqual({ signature: 'growth:2000', sessionId: 'cs_1' })
  })

  it('is taken once, so a reload cannot re-confirm a checkout', () => {
    markCheckoutPending({ signature: 'growth:2000', sessionId: 'cs_1' })
    takeCheckoutPending()
    expect(takeCheckoutPending()).toBeNull()
  })

  it('reads nothing when no checkout is pending', () => {
    expect(takeCheckoutPending()).toBeNull()
  })

  // A provider that returns no session handle leaves the webhook as the only path; the signature
  // still has to survive so the poll has a baseline to compare against.
  it('keeps the signature when there is no session id', () => {
    markCheckoutPending({ signature: 'growth:2000', sessionId: '' })
    expect(takeCheckoutPending()).toEqual({ signature: 'growth:2000', sessionId: '' })
  })

  // A checkout in flight across a deploy stored the bare signature this used to write. Dropping it
  // costs that buyer a toast, never the payment — and must not throw on the way past.
  it('drops a value written by the older format instead of throwing', () => {
    sessionStorage.setItem(KEY, 'growth:2000')
    expect(takeCheckoutPending()).toBeNull()
  })

  it('clears without reading', () => {
    markCheckoutPending({ signature: 'growth:2000', sessionId: 'cs_1' })
    clearCheckoutPending()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })
})
