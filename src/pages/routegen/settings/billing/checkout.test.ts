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

// The two guards in checkout.ts: the handshake, and what takes over once the iframe speaks.
const HANDSHAKE_MS = 15_000
const STALLED_MS = 30 * 60_000

// Initialize is reached only after the SDK's dynamic import resolves.
const started = async () => {
  await vi.waitFor(() => expect(Initialize).toHaveBeenCalled())
  return Initialize.mock.calls[0][0]
}

const KEY = 'pug:billingCheckoutPending'

beforeEach(() => sessionStorage.clear())

describe('the pending checkout', () => {
  it('carries the org, the signature and the session id across the provider redirect', () => {
    markCheckoutPending({ orgId: 'org-a', signature: 'growth:2000', sessionId: 'cs_1' })
    expect(takeCheckoutPending()).toEqual({ orgId: 'org-a', signature: 'growth:2000', sessionId: 'cs_1' })
  })

  it('is taken once, so a reload cannot re-confirm a checkout', () => {
    markCheckoutPending({ orgId: 'org-a', signature: 'growth:2000', sessionId: 'cs_1' })
    takeCheckoutPending()
    expect(takeCheckoutPending()).toBeNull()
  })

  it('reads nothing when no checkout is pending', () => {
    expect(takeCheckoutPending()).toBeNull()
  })

  // With no session handle the webhook is the only path, and the poll still needs a baseline.
  it('keeps the signature when there is no session id', () => {
    markCheckoutPending({ orgId: 'org-a', signature: 'growth:2000', sessionId: '' })
    expect(takeCheckoutPending()).toEqual({ orgId: 'org-a', signature: 'growth:2000', sessionId: '' })
  })

  // Written before the org was stamped on it; dropping it strands a paid checkout.
  it('reads a record written without an org', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ signature: 'growth:2000', sessionId: 'cs_1' }))
    expect(takeCheckoutPending()).toEqual({ orgId: '', signature: 'growth:2000', sessionId: 'cs_1' })
  })

  // sessionStorage is untrusted: anything off-shape drops rather than throws.
  it('drops a value it did not write instead of throwing', () => {
    sessionStorage.setItem(KEY, 'growth:2000')
    expect(takeCheckoutPending()).toBeNull()
  })

  it('clears without reading', () => {
    markCheckoutPending({ orgId: 'org-a', signature: 'growth:2000', sessionId: 'cs_1' })
    clearCheckoutPending()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })
})

describe('the checkout overlay', () => {
  beforeEach(() => vi.clearAllMocks())

  // The SDK validates the iframe's origin against this, so a disagreeing mode swallows every event.
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

  it('opens without the timer or the security badge', async () => {
    const outcome = openCheckoutOverlay(TEST_URL)
    ;(await started()).onEvent({ event_type: 'checkout.closed' })
    await expect(outcome).resolves.toEqual({ status: 'closed' })

    expect(openOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ options: { showTimer: false, showSecurityBadge: false } }),
    )
  })

  // All three arrive while the card form still works, so tearing the overlay down loses a live sale.
  // The wallet pair is inline-only, which is why the teardown one has to be here too.
  it('leaves the card form standing on a non-fatal error', async () => {
    const outcome = openCheckoutOverlay(TEST_URL)
    const { onEvent } = await started()

    onEvent({ event_type: 'checkout.error', data: { message: 'Wallet initialization failed' } })
    onEvent({ event_type: 'checkout.error', data: { message: 'Wallet payment failed' } })
    onEvent({ event_type: 'checkout.error', data: { message: 'Failed to close checkout' } })
    // Still open, so the customer can go on to pay by card.
    onEvent({ event_type: 'checkout.redirect' })

    await expect(outcome).resolves.toEqual({ status: 'redirect' })
  })

  // The detail is provider-internal English, so it is logged rather than shown to a buyer.
  it('fails on a checkout that could not be created, without quoting the provider', async () => {
    const outcome = openCheckoutOverlay(TEST_URL)
    const { onEvent } = await started()
    onEvent({ event_type: 'checkout.error', data: { message: 'Failed to create checkout' } })

    await expect(outcome).resolves.toEqual({ status: 'failed', message: 'Checkout could not be completed' })
  })

  // The only thing that settles a checkout the iframe never answers.
  it('fails a checkout the iframe never answers', async () => {
    vi.useFakeTimers()
    try {
      const outcome = openCheckoutOverlay(TEST_URL)
      await vi.advanceTimersByTimeAsync(HANDSHAKE_MS)

      await expect(outcome).resolves.toEqual({ status: 'failed', message: 'Checkout could not be opened' })
    } finally {
      vi.useRealTimers()
    }
  })

  // A wallet error spends the handshake window; settling on it anyway tears the overlay down under
  // a customer still typing a card.
  it('leaves the card form standing past the handshake window', async () => {
    vi.useFakeTimers()
    try {
      const outcome = openCheckoutOverlay(TEST_URL)
      await vi.advanceTimersByTimeAsync(0)
      const { onEvent } = Initialize.mock.calls[0][0]

      onEvent({ event_type: 'checkout.error', data: { message: 'Wallet initialization failed' } })
      await vi.advanceTimersByTimeAsync(4 * HANDSHAKE_MS)
      onEvent({ event_type: 'checkout.redirect' })

      await expect(outcome).resolves.toEqual({ status: 'redirect' })
    } finally {
      vi.useRealTimers()
    }
  })

  // An overlay that answers once and goes quiet still has to settle, or every plan button stays
  // disabled behind the hanging promise.
  it('settles an overlay that answers once and then goes quiet', async () => {
    vi.useFakeTimers()
    try {
      const outcome = openCheckoutOverlay(TEST_URL)
      await vi.advanceTimersByTimeAsync(0)
      const { onEvent } = Initialize.mock.calls[0][0]

      onEvent({ event_type: 'checkout.error', data: { message: 'Wallet initialization failed' } })
      await vi.advanceTimersByTimeAsync(STALLED_MS)

      await expect(outcome).resolves.toEqual({ status: 'closed' })
    } finally {
      vi.useRealTimers()
    }
  })

  // close() rethrows from openCheckoutOverlay's finally, where a throw overrides the outcome — and
  // the customer paid.
  it('keeps a completed payment when tearing the overlay down throws', async () => {
    closeOverlay.mockImplementationOnce(() => {
      throw new Error('iframe already detached')
    })

    const outcome = openCheckoutOverlay(TEST_URL)
    ;(await started()).onEvent({ event_type: 'checkout.redirect' })

    await expect(outcome).resolves.toEqual({ status: 'redirect' })
    // Cleared despite the throw, so the next unmount cannot clear someone else's pending.
    expect(closeCheckoutOverlay()).toBe(false)
  })

  // Without this the promise only settles on an event the SDK may never send, leaving a 30-minute
  // stall timer that later tears down whatever overlay is open by then.
  it('settles when the page closes an overlay it has already opened', async () => {
    const outcome = openCheckoutOverlay(TEST_URL)
    await started()

    expect(closeCheckoutOverlay()).toBe(true)

    await expect(outcome).resolves.toEqual({ status: 'closed' })
  })

  // Navigating away mid-import, where the overlay would open over whatever rendered next.
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

    expect(() => markCheckoutPending({ orgId: 'org-a', signature: 'growth:2000', sessionId: 'cs_1' })).not.toThrow()
    expect(() => clearCheckoutPending()).not.toThrow()
    expect(takeCheckoutPending()).toBeNull()

    setItem.mockRestore()
    removeItem.mockRestore()
  })
})
