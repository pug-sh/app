const PENDING_KEY = 'pug:billingCheckoutPending'

// A completed checkout navigates the whole page to the provider's return_url, so the plan the
// customer had *before* it has to outlive the reload — polling against the plan they came back to
// can never see the change a fast webhook already made.
export const markCheckoutPending = (signature: string) => sessionStorage.setItem(PENDING_KEY, signature)

export const takeCheckoutPending = () => {
  const signature = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  return signature
}

export const clearCheckoutPending = () => sessionStorage.removeItem(PENDING_KEY)

// The SDK validates the checkout iframe's postMessage origin against the mode given to Initialize,
// so a mode that disagrees with the session URL silently swallows every checkout event. Read it off
// the URL the server minted rather than a build flag that can drift from PUG_DODO_ENVIRONMENT.
const modeFor = (checkoutUrl: string) => {
  try {
    return new URL(checkoutUrl).hostname.startsWith('test.') ? 'test' : 'live'
  } catch {
    return 'live'
  }
}

// A white-label or renamed checkout host defeats the mode guess above, and then no event ever
// arrives — without this the promise never settles and every plan button stays disabled for the life
// of the page.
const HANDSHAKE_TIMEOUT_MS = 15_000

type CheckoutOutcome =
  // Paid; the page is about to navigate to the return URL.
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
  const wasOpen = closeActive !== null
  closeActive?.()
  closeActive = null
  return wasOpen
}

export const openCheckoutOverlay = async (checkoutUrl: string): Promise<CheckoutOutcome> => {
  const { DodoPayments } = await import('dodopayments-checkout')
  closeActive = () => DodoPayments.Checkout.close()
  try {
    return await new Promise<CheckoutOutcome>(resolve => {
      const handshake = setTimeout(
        () => resolve({ status: 'failed', message: 'Checkout could not be opened' }),
        HANDSHAKE_TIMEOUT_MS,
      )
      DodoPayments.Initialize({
        mode: modeFor(checkoutUrl),
        displayType: 'overlay',
        onEvent: event => {
          clearTimeout(handshake)
          if (event.event_type === 'checkout.redirect') resolve({ status: 'redirect' })
          if (event.event_type === 'checkout.closed') resolve({ status: 'closed' })
          if (event.event_type === 'checkout.error') resolve({ status: 'failed', message: 'Checkout failed' })
          if (event.event_type === 'checkout.link_expired') {
            resolve({ status: 'failed', message: 'This checkout link expired' })
          }
        },
      })
      DodoPayments.Checkout.open({ checkoutUrl })
    })
  } finally {
    closeCheckoutOverlay()
  }
}
