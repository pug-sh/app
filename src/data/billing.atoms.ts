import { Code, ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { GetBillingStatusResponse } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { billingRPCAtom, usageRPCAtom } from '@/api/rpc'
import { isDemoSessionAtom } from '@/auth/demo'
import { customerIdAtom } from '@/auth/jwt.atoms'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { billingSignature } from '@/lib/billing'
import { toProtoTimeRange } from '@/lib/timestamp'

// The status and the org it answers for, together — an org switch must not leave the previous
// org's quota on screen. `at` is what stops a dashboard left open all day from showing the quota it
// had at breakfast.
type BillingResult = {
  orgId: string
  status: GetBillingStatusResponse | null
  // Events recorded this period. Null means the meter has no answer for it — never metered, or not
  // yet reached this period — which the proto's `counted` flag is what distinguishes. Kept null
  // rather than 0 so no surface can render "0 of 500,000" for an org that has simply not been
  // summed yet.
  usedEvents: number | null
  error: string | null
  // Unimplemented: the deployment has no billing service at all, which is a different answer from a
  // call that failed. A retry can only ever fail the same way, so the surfaces drop instead of
  // offering one.
  unsupported: boolean
  at: number
}

const MAX_AGE_MS = 60_000

const billingResultAtom = atom<BillingResult | null>(null)
const inFlightAtom = atom<{ id: number; orgId: string; promise: Promise<void> } | null>(null)
let requestId = 0

const EMPTY = { status: null, usedEvents: null, error: null, unsupported: false, loaded: false }

export const billingAtom = atom(get => {
  const org = get(activeOrgAtom)
  const result = get(billingResultAtom)
  if (!org || result?.orgId !== org.id) return EMPTY
  return {
    status: result.status,
    usedEvents: result.usedEvents,
    error: result.error,
    unsupported: result.unsupported,
    loaded: true,
  }
})

// The quota is billing's and the count is the meter's, so "X of Y" is two calls. They are made
// together here because every surface that renders one renders the other.
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
            .catch(() => null),
        ])
        // `counted` is the proto's own answer to "is used_events a measurement of THIS period".
        // Without it a just-rolled-over period reads as a real zero.
        const usedEvents = usage?.counted ? Number(usage.usedEvents) : null
        if (fresh()) {
          set(billingResultAtom, {
            orgId: org.id,
            status,
            usedEvents,
            error: null,
            unsupported: false,
            at: Date.now(),
          })
        }
      } catch (err) {
        console.error('getBillingStatus failed:', err)
        const unsupported = err instanceof ConnectError && err.code === Code.Unimplemented
        if (fresh()) {
          set(billingResultAtom, {
            orgId: org.id,
            status: null,
            usedEvents: null,
            error: 'Failed to load billing',
            unsupported,
            at: 0,
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

  // A cached failure is not an answer, so it must not stop the next caller from retrying.
  const cached = get(billingResultAtom)
  if (!force && cached?.orgId === org.id && !cached.error && Date.now() - cached.at < MAX_AGE_MS) {
    return Promise.resolve()
  }
  return start()
})

export const resetBillingAtom = atom(null, (_, set) => {
  set(billingResultAtom, null)
  set(inFlightAtom, null)
})

// Terminal refusals: the payment landed and pug will not be able to place it however long anyone
// waits. Everything else — a network blip, an org the read could not resolve — is worth falling back
// to the poll for, since the webhook is still coming.
const TERMINAL_CONFIRM_CODES = new Set([Code.PermissionDenied, Code.FailedPrecondition])

// Asks the provider what the checkout did, rather than waiting for it to tell us. This is what
// confirms a returning buyer in one round trip, and the only thing that works at all on a deployment
// whose webhook URL is not reachable — where the poll below can never terminate.
//
// False is "not settled yet", not a failure: keep polling. A terminal refusal is rethrown, because
// "this page will update shortly" is a lie for a payment that needs a person.
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
// webhook that beat the customer home still reads as a change; a null signature is a failed load,
// never one.
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
    return customerId && stored.customerId === customerId ? stored.byOrg : {}
  },
  (get, set, { orgId, key }: { orgId: string; key: string }) => {
    const customerId = get(customerIdAtom)
    if (!customerId) return
    set(dismissedStoreAtom, { customerId, byOrg: { ...get(dismissedUsageBannerAtom), [orgId]: key } })
  },
)
