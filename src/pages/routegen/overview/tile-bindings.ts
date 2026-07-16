import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'

// Convention-driven candidate lists. Scanned in order; the first one present
// in the project's event schema wins. Add more entries here as we discover
// common customer conventions.
//
// page_view is the only primary candidate today: one event per navigation is the closest thing a web
// project has to a unit of "someone used this", where a click is one per interaction. Add a mobile
// equivalent here when the other SDKs grow one.
const PRIMARY_CANDIDATES = ['page_view'] as const
const SIGNIN_CANDIDATES = ['signin', 'signup', 'identified', 'account_created'] as const
const CONVERSION_CANDIDATES = [
  'purchased',
  'purchase',
  'checkout_completed',
  'conversion',
  'subscription_started',
] as const
// Monetization events that carry a numeric `amount` property (see the well-known
// event schemas — all use `amount`). Ordered most-direct-revenue first.
const REVENUE_CANDIDATES = [
  'purchase',
  'payment_succeeded',
  'subscription_started',
  'subscription_renewed',
  'invoice_paid',
] as const

type SigninKind = (typeof SIGNIN_CANDIDATES)[number]
type ConversionKind = (typeof CONVERSION_CANDIDATES)[number]
type RevenueKind = (typeof REVENUE_CANDIDATES)[number]

// Autocaptured kinds that fire on raw interaction rather than intent, so wherever autoCapture is on
// they win "most events" by a wide margin — a click on every interaction, a scroll on every page —
// and say nothing about what the project is for. Deliberately not the whole autocapture set: it also
// includes page_view, which is the pick we want, and form_submit, which is a real user action and a
// defensible primary for a project that has no page_view. Only consulted for the fallback below.
const NOT_PRIMARY: ReadonlySet<string> = new Set(['click', 'dead_click', 'rage_click', 'scroll'])

export type Bindings = Readonly<{
  // The event kind that best stands for activity in this project. Drives "active users", "event
  // volume", retention, funnel, platform breakdown, traffic source, and the live event feed.
  primary: string
  // First candidate kind that exists in the project. Null = no candidate
  // matched, in which case dependent tiles should hide themselves.
  signinLike: SigninKind | null
  conversionLike: ConversionKind | null
  // First monetization event present; drives the revenue tile (sum of `amount`).
  revenueLike: RevenueKind | null
}>

// Number(b.count - a.count): EventNameMeta.count is bigint (uint64). Doing the
// subtraction first keeps the diff in bigint, then collapsing to number is safe
// for any realistic event volume.

const findFirst = <T extends string>(candidates: readonly T[], available: Set<string>): T | null => {
  for (const candidate of candidates) {
    if (available.has(candidate)) return candidate
  }
  return null
}

export const pickBindings = (events: EventNameMeta[]): Bindings | null => {
  if (events.length === 0) return null
  const sorted = [...events].sort((a, b) => Number(b.count - a.count))
  const available = new Set(sorted.map(event => event.name))
  return {
    // Convention first, then the busiest event that isn't autocapture noise, and only then the
    // busiest event outright: a project whose every event is a click is better described as "via
    // click" than by hiding the whole Overview behind a null. That last tier announces itself —
    // every tile renders `via <kind>` — so a degraded pick is visible rather than silent.
    primary:
      findFirst(PRIMARY_CANDIDATES, available) ??
      sorted.find(event => !NOT_PRIMARY.has(event.name))?.name ??
      sorted[0].name,
    signinLike: findFirst(SIGNIN_CANDIDATES, available),
    conversionLike: findFirst(CONVERSION_CANDIDATES, available),
    revenueLike: findFirst(REVENUE_CANDIDATES, available),
  }
}

export const composeFunnelSteps = (bindings: Bindings): string[] => {
  const seen = new Set<string>()
  const steps: string[] = []
  for (const kind of [bindings.primary, bindings.signinLike, bindings.conversionLike]) {
    if (kind && !seen.has(kind)) {
      seen.add(kind)
      steps.push(kind)
    }
  }
  return steps
}
