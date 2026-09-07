const PENDING_KEY = 'pug:billingCheckoutPending'

// What a completed checkout has to carry across the provider's return_url, which navigates the whole
// page. `signature` is the plan the customer had *before* it — polling against the plan they came
// back to can never see the change a fast webhook already made. `orgId` is the org that started it:
// a second tab can move the session's org while this one is at the provider, and confirming would
// then send the wrong org's id with this session — refused, and reported as a payment that failed.
export type PendingCheckout = { orgId: string; signature: string; sessionId: string }

export const markCheckoutPending = (pending: PendingCheckout) => {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch (err) {
    // Site data blocked. The checkout still proceeds; only the confirmation after the reload is lost.
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

// The SDK validates the checkout iframe's postMessage origin against the mode given to Initialize,
// so a mode that disagrees with the session URL silently swallows every checkout event. Read it off
// the URL the server minted rather than a build flag that can drift from PUG_DODO_ENVIRONMENT.
const modeFor = (checkoutUrl: string) => {
  try {
    return new URL(checkoutUrl).hostname.startsWith('test.') ? 'test' : 'live'
  } catch (err) {
    console.error('could not read the checkout host; assuming live:', checkoutUrl, err)
    return 'live'
  }
}

// A white-label or renamed checkout host defeats the mode guess above, and then no event ever
// arrives — without this the promise never settles and every plan button stays disabled.
const HANDSHAKE_TIMEOUT_MS = 15_000

// What replaces the handshake guard once the iframe has spoken. An overlay that answered once and
// then went quiet — a wallet error and nothing after it — still has to settle, or the promise and
// the plan buttons behind it hang forever; but settling tears the overlay down, so this has to
// outlast any customer still typing a card.
const STALLED_TIMEOUT_MS = 30 * 60_000

type CheckoutOutcome =
  // The provider took the payment and is navigating to the return URL.
  | { status: 'redirect' }
  // The customer backed out — nothing can have changed.
  | { status: 'closed' }
  | { status: 'failed'; message: string }

let closeActive: (() => void) | null = null

// The SDK appends a fixed-position overlay to document.body and locks body scroll, both outside
// React — leaving the page without closing it strands them over whatever renders next. Returns
// whether one was still open, which is what separates navigating away mid-checkout from the page
// reload a completed one performs.
export const closeCheckoutOverlay = () => {
  const close = closeActive
  // Cleared before the call, not after: the SDK's close() rethrows on a teardown failure, and from
  // openCheckoutOverlay's finally that would turn a completed payment into "Failed to start checkout".
  closeActive = null
  try {
    close?.()
  } catch (err) {
    console.error('could not close the checkout overlay:', err)
  }
  return close !== null
}

// A wallet script blocked by an ad blocker, or a declined Apple Pay, both arrive as checkout.error
// while the card form behind them still works — only a checkout that failed to open is fatal.
const isWalletError = (detail: string) => /wallet/i.test(detail)

export const openCheckoutOverlay = async (checkoutUrl: string): Promise<CheckoutOutcome> => {
  // Registered before the import so navigating away while it loads still reads as "was open" —
  // otherwise the overlay opens over whatever rendered next, with nothing left to close it.
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
          // Any event proves the iframe is talking, which is all the handshake guards — a wallet
          // error included, even though it resolves nothing. Past that the overlay legitimately
          // stays open as long as the customer needs to type a card, so the long guard takes over.
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
      DodoPayments.Checkout.open({ checkoutUrl })
    })
  } finally {
    clearTimeout(timer)
    closeCheckoutOverlay()
  }
}
