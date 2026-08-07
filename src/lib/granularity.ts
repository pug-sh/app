import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { floorToZoneBucket } from '@/lib/timezone'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// Max time-range span allowed per granularity. Mirrors the buf.validate CEL constraints on
// QueryRequest in proto/shared/insights/v1/insights.proto (search "requires a time range of
// at most") — the backend rejects anything wider, e.g. "GRANULARITY_HOUR requires a time
// range of at most 14 days". Keep these in sync with the proto.
//
// This is a TOTAL map over Granularity (`satisfies Record<...>`): adding a new enum member
// without a cap is a compile error, not a silent "always allowed" at runtime. UNSPECIFIED
// ("Auto") maps to Infinity since it is always allowed and resolved to a concrete value
// elsewhere. MINUTE is included for completeness/validation but is not user-selectable
// (see SELECTABLE_GRANULARITIES).
export const GRANULARITY_MAX_RANGE_MS = {
  [Granularity.UNSPECIFIED]: Number.POSITIVE_INFINITY,
  [Granularity.MINUTE]: 6 * HOUR_MS,
  [Granularity.HOUR]: 14 * DAY_MS,
  [Granularity.DAY]: 365 * DAY_MS,
  [Granularity.WEEK]: 1461 * DAY_MS,
  [Granularity.MONTH]: 3652 * DAY_MS,
} as const satisfies Record<Granularity, number>

// Human-friendly cap labels for the disabled-option hint. Partial by design — only the
// user-selectable granularities need a friendly label; granularityDisabledReason falls back
// to a generic message for anything else.
const GRANULARITY_MAX_RANGE_LABEL: Partial<Record<Granularity, string>> = {
  [Granularity.MINUTE]: '6 hours',
  [Granularity.HOUR]: '14 days',
  [Granularity.DAY]: '365 days',
  [Granularity.WEEK]: '4 years',
  [Granularity.MONTH]: '10 years',
}

// The widest span any granularity supports — the coarsest finite cap (MONTH). A range wider
// than this has NO valid granularity, so every query over it would be rejected; clampRange
// caps selections to this so that can't happen.
export const MAX_SUPPORTED_RANGE_MS = GRANULARITY_MAX_RANGE_MS[Granularity.MONTH]

// User-selectable granularities, sorted ascending by cap (finest → coarsest). The sort makes
// the ordering an enforced invariant rather than a hand-maintained one: clampGranularity
// relies on it to return the FIRST (finest) granularity that fits, so it must stay ascending.
const SELECTABLE_GRANULARITIES = [Granularity.HOUR, Granularity.DAY, Granularity.WEEK, Granularity.MONTH].sort(
  (a, b) => GRANULARITY_MAX_RANGE_MS[a] - GRANULARITY_MAX_RANGE_MS[b],
)

export const rangeDurationMs = (range: TimeRange | undefined) =>
  range ? Math.max(0, range.to.getTime() - range.from.getTime()) : 0

// UNSPECIFIED ("auto") maps to an Infinity cap, so it is always allowed; a concrete value is
// derived from the range elsewhere.
export const isGranularityAllowed = (granularity: Granularity, range: TimeRange | undefined) =>
  rangeDurationMs(range) <= GRANULARITY_MAX_RANGE_MS[granularity]

// Disabled-reason for an OptionChip option, or null when the granularity is allowed.
export const granularityDisabledReason = (granularity: Granularity, range: TimeRange | undefined): string | null => {
  if (isGranularityAllowed(granularity, range)) return null
  const label = GRANULARITY_MAX_RANGE_LABEL[granularity]
  return label ? `Needs a time range of at most ${label}` : 'Time range too wide for this granularity'
}

// Cap a selected range to the widest supported span (anchored on `to`, the most recent edge),
// so a range too wide for every granularity can never reach the backend. A no-op for the
// common case of a range already within MAX_SUPPORTED_RANGE_MS.
export const clampRange = (range: TimeRange | undefined) => {
  if (!range) return range
  if (rangeDurationMs(range) <= MAX_SUPPORTED_RANGE_MS) return range
  return { from: new Date(range.to.getTime() - MAX_SUPPORTED_RANGE_MS), to: range.to }
}

// Auto-derive a sensible DEFAULT granularity from the range, biased toward fewer/coarser
// buckets (e.g. a ~1-year range lands on Week). Always returns an allowed value for any range
// within MAX_SUPPORTED_RANGE_MS. This is the only place the "Auto" ladder lives, and every
// page resolves UNSPECIFIED through it so "Auto" is identical everywhere.
//
// NOTE: clampGranularity uses a SEPARATE finest-that-fits rule (the caps above), not this
// ladder — the two intentionally differ. Auto prefers coarser buckets for readability; clamp
// keeps the finest granularity that is still valid. They are not the same function.
export const autoGranularity = (range: TimeRange | undefined) => {
  if (!range) return Granularity.UNSPECIFIED
  const durationMs = rangeDurationMs(range)
  if (durationMs <= DAY_MS) return Granularity.HOUR
  if (durationMs <= 90 * DAY_MS) return Granularity.DAY
  if (durationMs <= 730 * DAY_MS) return Granularity.WEEK
  return Granularity.MONTH
}

// Keep a granularity valid for the range: UNSPECIFIED stays auto, an allowed value is kept
// as-is, and a too-fine value is bumped to the smallest/finest granularity that still fits.
// (Day is valid up to exactly 365 days, so a 12-month range keeps Day; a ~400-day range bumps
// Day → Week, not all the way to Month.) Assumes range ≤ MAX_SUPPORTED_RANGE_MS (see clampRange).
export const clampGranularity = (granularity: Granularity, range: TimeRange | undefined) => {
  if (granularity === Granularity.UNSPECIFIED) return granularity
  if (isGranularityAllowed(granularity, range)) return granularity
  const durationMs = rangeDurationMs(range)
  for (const g of SELECTABLE_GRANULARITIES) {
    if (durationMs <= GRANULARITY_MAX_RANGE_MS[g]) return g
  }
  return Granularity.MONTH
}

// The `from` to send for a query: floored to the bucket boundary in the reporting zone so the
// first bucket is complete. Flooring extends the window backward, though, which can push a range
// the picker approved past the cap — the server validates what it receives. Keep the requested
// start in that case; a partial first bucket beats a rejected query.
export const alignRangeStart = (range: TimeRange, granularity: Granularity, timeZone: string) => {
  const floored = floorToZoneBucket(range.from, granularity, timeZone)
  if (range.to.getTime() - floored.getTime() <= GRANULARITY_MAX_RANGE_MS[granularity]) return floored
  return range.from
}

// Resolve a global granularity to a concrete value to hand down to dashboard/overview tiles:
// a concrete pick is used as-is, "Auto" resolves through autoGranularity, and undefined is
// returned only when there is no range to resolve "Auto" against — in which case tiles fall
// back to their own saved granularity. Shared by Overview and Dashboard so both behave alike.
export const resolveTileGranularity = (
  granularity: Granularity,
  range: TimeRange | undefined,
): Granularity | undefined => {
  const resolved = granularity === Granularity.UNSPECIFIED ? autoGranularity(range) : granularity
  return resolved === Granularity.UNSPECIFIED ? undefined : resolved
}
