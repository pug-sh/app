import { Code, ConnectError } from '@connectrpc/connect'
import { atom, type Getter, type Setter } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { GetBillingStatusResponse } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { billingRPCAtom, usageRPCAtom } from '@/api/rpc'
import { isDemoSessionAtom } from '@/auth/demo'
import { customerIdAtom } from '@/auth/jwt.atoms'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { billingSignature } from '@/lib/billing'
import { rpcErrorMessage } from '@/lib/rpc-error'
import { toProtoTimeRange } from '@/lib/timestamp'

// Paired with its org: a switch must not leave the previous org's quota on screen.
type BillingResult = {
  orgId: string
  status: GetBillingStatusResponse | null
  // Null is "no number to draw"; meterError tells a failed call from "not counted yet".
  usedEvents: number | null
  meterError: boolean
  error: string | null
  // No billing service here. A retry can only fail the same way, so surfaces drop.
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

// The one-day range bounds the daily series only; `used_events` always covers the period.
const startLoad = (get: Getter, set: Setter, orgId: string) => {
  const billingRPC = get(billingRPCAtom)
  const usageRPC = get(usageRPCAtom)
  const id = ++requestId
  // By request, not org: an org switch and back leaves an older request in the air.
  const current = () => get(inFlightAtom)?.id === id
  const fresh = () => current() && get(activeOrgAtom)?.id === orgId
  const promise = (async () => {
    try {
      const now = new Date()
      const [status, usage] = await Promise.all([
        billingRPC.getBillingStatus({ orgId }),
        // The optional half: without it the page still says what the org is entitled to.
        usageRPC
          .getUsage({
            orgId,
            range: toProtoTimeRange({ from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now }),
          })
          .catch(err => {
            console.error('getUsage failed; the meter has no count to draw:', err)
            return null
          }),
      ])
      // A fault, not a period the meter has not reached; conflated it reads as "not measured yet".
      const negative = !!usage?.counted && usage.usedEvents < 0n
      if (negative) console.error('getUsage returned a negative total:', usage?.usedEvents)
      const usedEvents = usage?.counted && !negative ? Number(usage.usedEvents) : null
      if (fresh()) {
        set(billingResultAtom, {
          orgId,
          status,
          usedEvents,
          meterError: usage === null || negative,
          error: null,
          unsupported: false,
          at: Date.now(),
        })
      }
    } catch (err) {
      console.error('getBillingStatus failed:', err)
      const unsupported = err instanceof ConnectError && err.code === Code.Unimplemented
      // Never blank a status we have: the past-due banner is the only notice a card was declined.
      const prev = get(billingResultAtom)
      const kept = prev?.orgId === orgId ? prev : null
      if (fresh()) {
        set(billingResultAtom, {
          orgId,
          status: kept?.status ?? null,
          usedEvents: kept?.usedEvents ?? null,
          meterError: kept?.meterError ?? false,
          error: rpcErrorMessage(err, 'Failed to load billing'),
          unsupported,
          // Cached only when the answer cannot change, or every window focus re-asks.
          at: unsupported ? Date.now() : 0,
        })
      }
    } finally {
      if (current()) set(inFlightAtom, null)
    }
  })()
  set(inFlightAtom, { id, orgId, promise })
  return promise
}

const runLoad = (get: Getter, set: Setter, force: boolean): Promise<void> => {
  const org = get(activeOrgAtom)
  if (!org) return Promise.resolve()
  // The demo is a shared viewer of someone else's org, with every billing surface hidden.
  if (get(isDemoSessionAtom)) return Promise.resolve()

  const inFlight = get(inFlightAtom)
  // Re-entered rather than chaining a startLoad holding the org read above: the org can move while
  // the first request is out.
  if (inFlight?.orgId === org.id) return force ? inFlight.promise.then(() => runLoad(get, set, true)) : inFlight.promise

  // A cached failure must not stop the next retry, unless the answer cannot change.
  const cached = get(billingResultAtom)
  const usable = cached && (!cached.error || cached.unsupported)
  if (!force && cached?.orgId === org.id && usable && Date.now() - cached.at < MAX_AGE_MS) {
    return Promise.resolve()
  }
  return startLoad(get, set, org.id)
}

export const loadBillingAtom = atom(null, (get, set, { force = false }: { force?: boolean } = {}) =>
  runLoad(get, set, force),
)

export const resetBillingAtom = atom(null, (_, set) => {
  set(billingResultAtom, null)
  set(inFlightAtom, null)
})

// Unplaceable however long anyone waits. Everything else falls back to the poll.
const TERMINAL_CONFIRM_CODES = new Set([Code.PermissionDenied, Code.FailedPrecondition])

// Asks the provider rather than waiting to be told, which is all that works where the webhook URL
// is unreachable. False is "not settled yet", not a failure.
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

// The signature from *before* checkout opened, and the org it was taken in.
type PollAfterCheckout = { orgId: string; before: string }

// Back before the webhook lands, the page still reads "Free" — indistinguishable from a payment
// that failed. A null signature is a failed load, not a change.
export const pollBillingAfterCheckoutAtom = atom(null, async (get, set, { orgId, before }: PollAfterCheckout) => {
  // The baseline is the paying org's, so another org's plan is never this checkout landing.
  const sameOrg = () => get(activeOrgAtom)?.id === orgId
  const changed = () => {
    if (!sameOrg()) return false
    const now = billingSignature(get(billingAtom).status)
    return now !== null && now !== before
  }

  await set(loadBillingAtom, { force: true })
  if (changed()) return true

  for (const delay of CHECKOUT_POLL_DELAYS_MS) {
    // Nothing readable here answers for the org they paid in any more.
    if (!sameOrg()) return false
    await new Promise(resolve => setTimeout(resolve, delay))
    await set(loadBillingAtom, { force: true })
    if (changed()) return true
  }
  return false
})

// Stamped with the customer, or two accounts sharing an org share a dismissal. getOnInit so it is
// known on the first render, as lastProjectAtom does with this same shape.
const dismissedStoreAtom = atomWithStorage<{ customerId: string; byOrg: Record<string, string> }>(
  'pug:billingBannerDismissed',
  { customerId: '', byOrg: {} },
  undefined,
  { getOnInit: true },
)

export const dismissedUsageBannerAtom = atom(
  get => {
    const customerId = get(customerIdAtom)
    const stored = get(dismissedStoreAtom)
    if (!customerId || stored?.customerId !== customerId) return {}
    // Storage is untrusted, and a missing byOrg throws where the banner indexes this.
    return stored.byOrg ?? {}
  },
  (get, set, { orgId, key }: { orgId: string; key: string }) => {
    const customerId = get(customerIdAtom)
    if (!customerId) return
    set(dismissedStoreAtom, { customerId, byOrg: { ...get(dismissedUsageBannerAtom), [orgId]: key } })
  },
)
