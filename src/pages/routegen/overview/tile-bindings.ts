import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'

// Convention-driven candidate lists. Scanned in order; the first one present
// in the project's event schema wins. Add more entries here as we discover
// common customer conventions.
const SIGNIN_CANDIDATES = ['signin', 'signup', 'identified', 'account_created'] as const
const CONVERSION_CANDIDATES = ['purchased', 'checkout_completed', 'conversion', 'subscription_started'] as const

type SigninKind = (typeof SIGNIN_CANDIDATES)[number]
type ConversionKind = (typeof CONVERSION_CANDIDATES)[number]

export type Bindings = Readonly<{
  // The most-active event kind. Drives "active users", "event volume",
  // retention, funnel, platform breakdown, and the live event feed.
  primary: string
  // First candidate kind that exists in the project. Null = no candidate
  // matched, in which case dependent tiles should hide themselves.
  signinLike: SigninKind | null
  conversionLike: ConversionKind | null
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
    primary: sorted[0].name,
    signinLike: findFirst(SIGNIN_CANDIDATES, available),
    conversionLike: findFirst(CONVERSION_CANDIDATES, available),
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
