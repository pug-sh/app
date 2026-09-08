const PENDING_KEY = 'pug:billingCheckoutPending'

// Carried across the provider's full-page return. `signature` is the plan from *before* checkout;
// `orgId` catches a second tab having moved the session's org meanwhile.
export type PendingCheckout = { orgId: string; signature: string; sessionId: string }

export const markCheckoutPending = (pending: PendingCheckout) => {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch (err) {
    // Site data blocked: checkout still proceeds, only the confirmation after the reload is lost.
    console.error('could not record the pending checkout:', err)
  }
}

export const takeCheckoutPending = (): PendingCheckout | null => {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(PENDING_KEY)
    sessionStorage.removeItem(PENDING_KEY)
  } catch (err) {
    console.error('could not read the pending checkout:', err)
    return null
  }
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.signature !== 'string' || parsed.signature === '') return null
    return {
      orgId: typeof parsed.orgId === 'string' ? parsed.orgId : '',
      signature: parsed.signature,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
    }
  } catch (err) {
    // A record we cannot read is a payment we cannot confirm.
    console.error('could not parse the pending checkout:', err)
    return null
  }
}

export const clearCheckoutPending = () => {
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch (err) {
    console.error('could not clear the pending checkout:', err)
  }
}

// The SDK validates the iframe's postMessage origin against this, so a mode disagreeing with the
// session swallows every event. Off the minted URL, never a build flag.
const modeFor = (checkoutUrl: string) => {
  try {
    return new URL(checkoutUrl).hostname.startsWith('test.') ? 'test' : 'live'
  } catch (err) {
    console.error('could not read the checkout host; assuming live:', checkoutUrl, err)
    return 'live'
  }
}

// A renamed checkout host defeats the mode guess above, and then no event ever arrives.
const HANDSHAKE_TIMEOUT_MS = 15_000

// Settling tears the overlay down, so this has to outlast anyone still typing a card.
const STALLED_TIMEOUT_MS = 30 * 60_000

type CheckoutOutcome = { status: 'redirect' } | { status: 'closed' } | { status: 'failed'; message: string }

let closeActive: (() => void) | null = null

// The overlay lives outside React, so leaving the page closes it by hand. Returns whether one was
// open, which is how navigating away is told from a completed reload.
export const closeCheckoutOverlay = () => {
  const close = closeActive
  // Cleared first, so a throwing close() leaves nothing for a later unmount to find and act on.
  closeActive = null
  try {
    close?.()
  } catch (err) {
    console.error('could not close the checkout overlay:', err)
    // The SDK unlocks the body last, so a throw before that leaves the page unable to scroll.
    document.body.style.overflow = ''
    document.body.style.contain = ''
  }
  return close !== null
}

// Both arrive while the card form behind them still works. The wallet ones reach an inline checkout
// only; 'Failed to close checkout' is what an overlay sees.
const isNonFatal = (detail: string) => /wallet|failed to close checkout/i.test(detail)

export const openCheckoutOverlay = async (checkoutUrl: string): Promise<CheckoutOutcome> => {
  // Registered before the import, or an overlay opening after the page moved on cannot be closed.
  let cancelled = false
  closeActive = () => {
    cancelled = true
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const { DodoPayments } = await import('dodopayments-checkout')
    if (cancelled) return { status: 'closed' }
    return await new Promise<CheckoutOutcome>(resolve => {
      // Closing settles too, or an overlay torn down on navigation keeps its stall timer and half an
      // hour later clears a newer checkout's record.
      closeActive = () => {
        try {
          DodoPayments.Checkout.close()
        } finally {
          // Settled even when teardown throws, or this hangs to the stall timer.
          resolve({ status: 'closed' })
        }
      }
      const mode = modeFor(checkoutUrl)
      timer = setTimeout(() => {
        console.error('no checkout event arrived; check the mode against the host:', mode, checkoutUrl)
        resolve({ status: 'failed', message: 'Checkout could not be opened' })
      }, HANDSHAKE_TIMEOUT_MS)
      let heard = false
      DodoPayments.Initialize({
        mode,
        displayType: 'overlay',
        onEvent: event => {
          // Any event proves the iframe is talking, which is all the handshake guards; past it the
          // overlay legitimately stays open as long as a card takes.
          if (!heard) {
            heard = true
            clearTimeout(timer)
            timer = setTimeout(() => resolve({ status: 'closed' }), STALLED_TIMEOUT_MS)
          }
          if (event.event_type === 'checkout.redirect') resolve({ status: 'redirect' })
          if (event.event_type === 'checkout.closed') resolve({ status: 'closed' })
          if (event.event_type === 'checkout.error') {
            const detail = typeof event.data?.message === 'string' ? event.data.message : ''
            console.error('dodo checkout error:', detail || '(no message)')
            // Provider-internal English ('Failed to process message'), so it stays in the log.
            if (!isNonFatal(detail)) resolve({ status: 'failed', message: 'Checkout could not be completed' })
          }
          if (event.event_type === 'checkout.link_expired') {
            resolve({ status: 'failed', message: 'This checkout link expired' })
          }
        },
      })
      // Consumer-funnel pressure on a B2B upgrade. Cosmetic: they ride the URL as query params.
      DodoPayments.Checkout.open({
        checkoutUrl,
        options: { showTimer: false, showSecurityBadge: false },
      })
    })
  } finally {
    clearTimeout(timer)
    closeCheckoutOverlay()
  }
}
