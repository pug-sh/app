const PENDING_KEY = 'pug:billingCheckoutPending'

// Carried across the provider's full-page return. `signature` is the plan from *before* checkout;
// `orgId` guards a second tab having moved the session's org while this one was away.
export type PendingCheckout = { orgId: string; signature: string; sessionId: string }

export const markCheckoutPending = (pending: PendingCheckout) => {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch (err) {
    // Site data blocked — checkout still proceeds, only the confirmation after the reload is lost.
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
    if (typeof parsed?.signature !== 'string') return null
    return {
      orgId: typeof parsed.orgId === 'string' ? parsed.orgId : '',
      signature: parsed.signature,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
    }
  } catch {
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
// session silently swallows every event — read it off the minted URL, never a build flag.
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

// An overlay that spoke once and went quiet still has to settle — but settling tears it down, so
// this has to outlast any customer still typing a card.
const STALLED_TIMEOUT_MS = 30 * 60_000

type CheckoutOutcome = { status: 'redirect' } | { status: 'closed' } | { status: 'failed'; message: string }

let closeActive: (() => void) | null = null

// The overlay and its body-scroll lock live outside React, so leaving the page has to close them by
// hand. Returns whether one was open — how navigating away is told from a completed reload.
export const closeCheckoutOverlay = () => {
  const close = closeActive
  // Cleared before the call: close() rethrows, which from the finally below would report a completed
  // payment as a failed one.
  closeActive = null
  try {
    close?.()
  } catch (err) {
    console.error('could not close the checkout overlay:', err)
  }
  return close !== null
}

// A blocked wallet script and a declined Apple Pay both arrive as checkout.error while the card
// form behind them still works.
const isWalletError = (detail: string) => /wallet/i.test(detail)

export const openCheckoutOverlay = async (checkoutUrl: string): Promise<CheckoutOutcome> => {
  // Registered before the import, or an overlay opening after the page moved on has nothing left to
  // close it.
  let cancelled = false
  closeActive = () => {
    cancelled = true
  }
  const { DodoPayments } = await import('dodopayments-checkout')
  if (cancelled) return { status: 'closed' }
  closeActive = () => DodoPayments.Checkout.close()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<CheckoutOutcome>(resolve => {
      timer = setTimeout(() => {
        console.error('no checkout event arrived; check the mode against the host:', modeFor(checkoutUrl), checkoutUrl)
        resolve({ status: 'failed', message: 'Checkout could not be opened' })
      }, HANDSHAKE_TIMEOUT_MS)
      let heard = false
      DodoPayments.Initialize({
        mode: modeFor(checkoutUrl),
        displayType: 'overlay',
        onEvent: event => {
          // Any event proves the iframe is talking, which is all the handshake guards; past that
          // the overlay legitimately stays open for as long as a card takes.
          if (!heard) {
            heard = true
            clearTimeout(timer)
            timer = setTimeout(() => resolve({ status: 'closed' }), STALLED_TIMEOUT_MS)
          }
          const detail = typeof event.data?.message === 'string' ? event.data.message : ''
          if (event.event_type === 'checkout.redirect') resolve({ status: 'redirect' })
          if (event.event_type === 'checkout.closed') resolve({ status: 'closed' })
          if (event.event_type === 'checkout.error') {
            console.error('dodo checkout error:', detail || '(no message)')
            if (!isWalletError(detail)) resolve({ status: 'failed', message: detail || 'Checkout failed' })
          }
          if (event.event_type === 'checkout.link_expired') {
            resolve({ status: 'failed', message: 'This checkout link expired' })
          }
        },
      })
      // Both read as consumer-funnel pressure on a B2B upgrade. They ride the URL as
      // query params, so a buyer can turn them back on -- cosmetic either way.
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
