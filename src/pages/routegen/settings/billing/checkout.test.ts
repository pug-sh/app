import { beforeEach, describe, expect, it, vi } from 'vitest'

const { Initialize, openOverlay, closeOverlay } = vi.hoisted(() => ({
  Initialize: vi.fn(),
  openOverlay: vi.fn(),
  closeOverlay: vi.fn(),
}))

vi.mock('dodopayments-checkout', () => ({
  DodoPayments: { Initialize, Checkout: { open: openOverlay, close: closeOverlay } },
}))

const { clearCheckoutPending, closeCheckoutOverlay, markCheckoutPending, openCheckoutOverlay, takeCheckoutPending } =
  await import('./checkout')

const TEST_URL = 'https://test.checkout.dodopayments.com/session'
const LIVE_URL = 'https://checkout.dodopayments.com/session'

// Initialize is reached only after the SDK's dynamic import resolves.
const started = async () => {
  await vi.waitFor(() => expect(Initialize).toHaveBeenCalled())
  return Initialize.mock.calls[0][0]
}

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

  // sessionStorage is untrusted input; anything that is not our shape must drop, not throw.
  it('drops a value it did not write instead of throwing', () => {
    sessionStorage.setItem(KEY, 'growth:2000')
    expect(takeCheckoutPending()).toBeNull()
  })

  it('clears without reading', () => {
    markCheckoutPending({ signature: 'growth:2000', sessionId: 'cs_1' })
    clearCheckoutPending()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })
})

describe('the checkout overlay', () => {
  beforeEach(() => vi.clearAllMocks())

  // The SDK validates the iframe's postMessage origin against this mode, so a mode that disagrees
  // with the minted URL swallows every event and the customer waits out the handshake timeout.
  it('takes its mode from the host the server minted, not a build flag', async () => {
    const test = openCheckoutOverlay(TEST_URL)
    ;(await started()).onEvent({ event_type: 'checkout.closed' })
    await test
    expect(Initialize.mock.calls[0][0].mode).toBe('test')

    vi.clearAllMocks()
    const live = openCheckoutOverlay(LIVE_URL)
    ;(await started()).onEvent({ event_type: 'checkout.closed' })
    await live
    expect(Initialize.mock.calls[0][0].mode).toBe('live')
  })

  // An ad blocker eating the wallet script, or a declined Apple Pay, both arrive as checkout.error
  // while the card form behind them still works. Tearing the overlay down loses a live sale.
  it('leaves the card form standing when a wallet fails', async () => {
    const outcome = openCheckoutOverlay(TEST_URL)
    const { onEvent } = await started()

    onEvent({ event_type: 'checkout.error', data: { message: 'Wallet initialization failed' } })
    onEvent({ event_type: 'checkout.error', data: { message: 'Wallet payment failed' } })
    // Still open: the customer goes on to pay by card.
    onEvent({ event_type: 'checkout.redirect' })

    await expect(outcome).resolves.toEqual({ status: 'redirect' })
  })

  it('fails on a checkout that could not be created, and says why', async () => {
    const outcome = openCheckoutOverlay(TEST_URL)
    const { onEvent } = await started()
    onEvent({ event_type: 'checkout.error', data: { message: 'Failed to create checkout' } })

    await expect(outcome).resolves.toEqual({ status: 'failed', message: 'Failed to create checkout' })
  })

  // Navigating away while the SDK chunk is still loading: without the guard the overlay opens over
  // whatever rendered next, with nothing registered to close it.
  it('does not open an overlay the page has already left', async () => {
    const outcome = openCheckoutOverlay(TEST_URL)
    expect(closeCheckoutOverlay()).toBe(true)

    await expect(outcome).resolves.toEqual({ status: 'closed' })
    expect(openOverlay).not.toHaveBeenCalled()
  })
})

describe('blocked site data', () => {
  it('does not throw when sessionStorage refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('site data blocked')
    })
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('site data blocked')
    })

    expect(() => markCheckoutPending({ signature: 'growth:2000', sessionId: 'cs_1' })).not.toThrow()
    expect(() => clearCheckoutPending()).not.toThrow()
    expect(takeCheckoutPending()).toBeNull()

    setItem.mockRestore()
    removeItem.mockRestore()
  })
})
