import { Code, ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { GetBillingStatusResponse } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { billingRPCAtom, usageRPCAtom } from '@/api/rpc'
import { isDemoSessionAtom } from '@/auth/demo'
import { customerIdAtom } from '@/auth/jwt.atoms'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { billingSignature } from '@/lib/billing'
import { rpcErrorMessage } from '@/lib/rpc-error'
import { toProtoTimeRange } from '@/lib/timestamp'

// The status and the org it answers for, together — an org switch must not leave the previous org's
// quota on screen.
type BillingResult = {
  orgId: string
  status: GetBillingStatusResponse | null
  // Null means there is no number to draw: never metered, not yet counted this period, or the meter
  // call failed. `meterError` separates that last one, which must not read as "not measured yet".
  usedEvents: number | null
  meterError: boolean
  error: string | null
  // Unimplemented: the deployment has no billing service at all, which is a different answer from a
  // call that failed. A retry can only ever fail the same way, so the surfaces drop instead.
  unsupported: boolean
  at: number
}

const MAX_AGE_MS = 60_000

const billingResultAtom = atom<BillingResult | null>(null)
const inFlightAtom = atom<{ id: number; orgId: string; promise: Promise<void> } | null>(null)
let requestId = 0

const EMPTY = { status: null, usedEvents: null, meterError: false, error: null, unsupported: false, loaded: false }

export const billingAtom = atom(get => {
  const org = get(activeOrgAtom)
  const result = get(billingResultAtom)
  if (!org || result?.orgId !== org.id) return EMPTY
  return {
    status: result.status,
    usedEvents: result.usedEvents,
    meterError: result.meterError,
    error: result.error,
    unsupported: result.unsupported,
    loaded: true,
  }
})

// The quota is billing's and the count is the meter's, so "X of Y" is two calls, made together
// because every surface that renders one renders the other.
//
// The usage call carries a one-day range on purpose: `range` bounds the DAILY SERIES only and
// `used_events` always covers the whole period, so this asks for the period total without dragging
// back a row per (project, day) that nothing here draws.
export const loadBillingAtom = atom(null, (get, set, { force = false }: { force?: boolean } = {}) => {
  const org = get(activeOrgAtom)
  if (!org) return Promise.resolve()
  // The demo signs everyone in as a shared viewer of someone else's org, and hides every billing
  // surface anyway.
  if (get(isDemoSessionAtom)) return Promise.resolve()

  const start = () => {
    const billingRPC = get(billingRPCAtom)
    const usageRPC = get(usageRPCAtom)
    const id = ++requestId
    // By request, not just by org: an org switch and back leaves an older request in the air whose
    // answer would otherwise overwrite the newer one, and whose `finally` would unregister it.
    const current = () => get(inFlightAtom)?.id === id
    const fresh = () => current() && get(activeOrgAtom)?.id === org.id
    const promise = (async () => {
      try {
        const now = new Date()
        const [status, usage] = await Promise.all([
          billingRPC.getBillingStatus({ orgId: org.id }),
          // Failing the whole load on a usage error would drop the plan too. The meter is the
          // optional half: without it the page still says what the org is entitled to.
          usageRPC
            .getUsage({
              orgId: org.id,
              range: toProtoTimeRange({ from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now }),
            })
            .catch(err => {
              console.error('getUsage failed; the meter has no count to draw:', err)
              return null
            }),
        ])
        // `counted` is the proto's own answer to "is used_events a measurement of THIS period".
        // Negative is refused for the same reason the usage page refuses it — not a number to show.
        const usedEvents = usage?.counted && usage.usedEvents >= 0n ? Number(usage.usedEvents) : null
        if (fresh()) {
          set(billingResultAtom, {
            orgId: org.id,
            status,
            usedEvents,
            meterError: usage === null,
            error: null,
            unsupported: false,
            at: Date.now(),
          })
        }
      } catch (err) {
        console.error('getBillingStatus failed:', err)
        const unsupported = err instanceof ConnectError && err.code === Code.Unimplemented
        // A transient failure must not blank a status we already have: the past-due banner is the
        // only in-app notice that a card was declined.
        const prev = get(billingResultAtom)
        const kept = prev?.orgId === org.id ? prev : null
        if (fresh()) {
          set(billingResultAtom, {
            orgId: org.id,
            status: kept?.status ?? null,
            usedEvents: kept?.usedEvents ?? null,
            meterError: kept?.meterError ?? false,
            error: rpcErrorMessage(err, 'Failed to load billing'),
            unsupported,
            // Cached only when the answer cannot change: a deployment with no billing service would
            // otherwise re-ask on every window focus, forever.
            at: unsupported ? Date.now() : 0,
          })
        }
      } finally {
        if (current()) set(inFlightAtom, null)
      }
    })()
    set(inFlightAtom, { id, orgId: org.id, promise })
    return promise
  }

  const inFlight = get(inFlightAtom)
  // A forced caller wants an answer newer than the one already in the air.
  if (inFlight?.orgId === org.id) return force ? inFlight.promise.then(start) : inFlight.promise

  // A cached failure is not an answer, so it must not stop the next caller from retrying — unless
  // the answer cannot change, which is what `unsupported` means.
  const cached = get(billingResultAtom)
  const usable = cached && (!cached.error || cached.unsupported)
  if (!force && cached?.orgId === org.id && usable && Date.now() - cached.at < MAX_AGE_MS) {
    return Promise.resolve()
  }
  return start()
})

export const resetBillingAtom = atom(null, (_, set) => {
  set(billingResultAtom, null)
  set(inFlightAtom, null)
})

// Terminal refusals: pug will not be able to place this however long anyone waits. Everything else —
// a network blip, a server without ConfirmCheckout — falls back to the poll, since the webhook is
// still coming.
const TERMINAL_CONFIRM_CODES = new Set([Code.PermissionDenied, Code.FailedPrecondition])

// Asks the provider what the checkout did rather than waiting for it to tell us — the only thing
// that works on a deployment whose webhook URL is not reachable, where the poll can never terminate.
// False is "not settled yet", not a failure. A terminal refusal is rethrown, because "this page will
// update shortly" is a lie for a payment that needs a person.
export const confirmCheckoutAtom = atom(null, async (get, set, sessionId: string) => {
  const org = get(activeOrgAtom)
  if (!org || !sessionId || get(isDemoSessionAtom)) return false
  try {
    const { confirmed } = await get(billingRPCAtom).confirmCheckout({ orgId: org.id, sessionId })
    if (!confirmed) return false
  } catch (err) {
    console.error('confirmCheckout failed:', err)
    if (err instanceof ConnectError && TERMINAL_CONFIRM_CODES.has(err.code)) throw err
    return false
  }
  await set(loadBillingAtom, { force: true })
  return true
})

const CHECKOUT_POLL_DELAYS_MS = [1500, 3000, 5000, 8000]

// The customer is back before the webhook lands, so the page still reads "Free" — which looks
// exactly like a payment that failed. `before` is the signature taken *before* checkout opened, so a
// webhook that beat the customer home still reads as a change; a null signature is a failed load.
export const pollBillingAfterCheckoutAtom = atom(null, async (get, set, before: string) => {
  const changed = () => {
    const now = billingSignature(get(billingAtom).status)
    return now !== null && now !== before
  }

  await set(loadBillingAtom, { force: true })
  if (changed()) return true

  for (const delay of CHECKOUT_POLL_DELAYS_MS) {
    await new Promise(resolve => setTimeout(resolve, delay))
    await set(loadBillingAtom, { force: true })
    if (changed()) return true
  }
  return false
})

// Stamped with the customer for the same reason lastProjectAtom is: one browser outlives one
// account, and under an org key alone two accounts sharing an org share one dismissal.
const dismissedStoreAtom = atomWithStorage<{ customerId: string; byOrg: Record<string, string> }>(
  'pug:billingBannerDismissed',
  { customerId: '', byOrg: {} },
)

export const dismissedUsageBannerAtom = atom(
  get => {
    const customerId = get(customerIdAtom)
    const stored = get(dismissedStoreAtom)
    // Storage is untrusted input: a stored value missing byOrg would throw on the lookup below.
    if (!customerId || stored?.customerId !== customerId) return {}
    return stored.byOrg ?? {}
  },
  (get, set, { orgId, key }: { orgId: string; key: string }) => {
    const customerId = get(customerIdAtom)
    if (!customerId) return
    set(dismissedStoreAtom, { customerId, byOrg: { ...get(dismissedUsageBannerAtom), [orgId]: key } })
  },
)
