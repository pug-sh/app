import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// Max time-range span allowed per granularity. Mirrors the buf.validate CEL
// constraints on QueryRequest in proto/shared/insights/v1/insights.proto — the
// backend rejects anything wider (e.g. "GRANULARITY_HOUR requires a time range of
// at most 14 days"). Keep these in sync with the proto.
export const GRANULARITY_MAX_RANGE_MS: Partial<Record<Granularity, number>> = {
  [Granularity.MINUTE]: 6 * HOUR_MS,
  [Granularity.HOUR]: 14 * DAY_MS,
  [Granularity.DAY]: 365 * DAY_MS,
  [Granularity.WEEK]: 1461 * DAY_MS,
  [Granularity.MONTH]: 3652 * DAY_MS,
}

// Human-friendly cap labels for the disabled-option hint.
const GRANULARITY_MAX_RANGE_LABEL: Partial<Record<Granularity, string>> = {
  [Granularity.MINUTE]: '6 hours',
  [Granularity.HOUR]: '14 days',
  [Granularity.DAY]: '365 days',
  [Granularity.WEEK]: '4 years',
  [Granularity.MONTH]: '10 years',
}

// Selectable granularities, finest → coarsest (matches their ascending max range).
const SELECTABLE_GRANULARITIES = [
  Granularity.HOUR,
  Granularity.DAY,
  Granularity.WEEK,
  Granularity.MONTH,
] as const

export const rangeDurationMs = (range: TimeRange | undefined) =>
  range ? Math.max(0, range.to.getTime() - range.from.getTime()) : 0

// UNSPECIFIED ("auto") is always allowed — a concrete value is derived from the range.
export const isGranularityAllowed = (granularity: Granularity, range: TimeRange | undefined) => {
  if (granularity === Granularity.UNSPECIFIED) return true
  const max = GRANULARITY_MAX_RANGE_MS[granularity]
  if (max === undefined) return true
  return rangeDurationMs(range) <= max
}

// Disabled-reason for an OptionChip option, or null when the granularity is allowed.
export const granularityDisabledReason = (granularity: Granularity, range: TimeRange | undefined): string | null => {
  if (isGranularityAllowed(granularity, range)) return null
  const label = GRANULARITY_MAX_RANGE_LABEL[granularity]
  return label ? `Needs a time range of at most ${label}` : 'Time range too wide for this granularity'
}

// Auto-derive a sensible granularity from the range. Always returns an allowed value.
// Single source of truth for the ladder — both the "Auto" option and clampGranularity
// below resolve through this, so every page derives an identical granularity for a
// given range (e.g. a ~1-year range lands on Week, not Month, everywhere).
export const autoGranularity = (range: TimeRange | undefined) => {
  if (!range) return Granularity.UNSPECIFIED
  const durationMs = rangeDurationMs(range)
  if (durationMs <= DAY_MS) return Granularity.HOUR
  if (durationMs <= 90 * DAY_MS) return Granularity.DAY
  if (durationMs <= 730 * DAY_MS) return Granularity.WEEK
  return Granularity.MONTH
}

// Keep a granularity valid for the range: UNSPECIFIED stays auto, an allowed value is
// kept as-is, and a too-fine value (e.g. Day over a 12-month range) is bumped to the
// smallest/finest granularity that still fits (Day → Week, not all the way to Month).
export const clampGranularity = (granularity: Granularity, range: TimeRange | undefined) => {
  if (granularity === Granularity.UNSPECIFIED) return granularity
  if (isGranularityAllowed(granularity, range)) return granularity
  const durationMs = rangeDurationMs(range)
  for (const g of SELECTABLE_GRANULARITIES) {
    if (durationMs <= (GRANULARITY_MAX_RANGE_MS[g] ?? Infinity)) return g
  }
  return Granularity.MONTH
}
