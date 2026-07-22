import { create } from '@bufbuild/protobuf'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { ComparePeriod } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { type QueryRequest, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { toProtoTimeRange } from '@/lib/timestamp'

const DAY_MS = 24 * 60 * 60 * 1000

type PriorUnit = 'day' | 'week' | 'month' | 'year' | 'duration'

const isMidnight = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0

const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
const daysInYear = (d: Date) => (new Date(d.getFullYear(), 1, 29).getDate() === 29 ? 366 : 365)

// The calendar period a window is a slice of: the smallest unit it starts on and still fits inside.
// A window starting mid-day, or overflowing its unit, has none and shifts by its own length instead.
const priorUnit = (from: Date, durationMs: number): PriorUnit => {
  if (!isMidnight(from)) return 'duration'
  if (durationMs <= DAY_MS) return 'day'
  // Monday-anchored, matching startOfWeek in date-presets.
  if (from.getDay() === 1 && durationMs <= 7 * DAY_MS) return 'week'
  if (from.getDate() === 1 && durationMs <= daysInMonth(from) * DAY_MS) return 'month'
  if (from.getMonth() === 0 && from.getDate() === 1 && durationMs <= daysInYear(from) * DAY_MS) return 'year'
  return 'duration'
}

const shiftBack = (from: Date, unit: PriorUnit, durationMs: number) => {
  const shifted = new Date(from)
  switch (unit) {
    case 'day':
      shifted.setDate(shifted.getDate() - 1)
      return shifted
    case 'week':
      shifted.setDate(shifted.getDate() - 7)
      return shifted
    case 'month':
      shifted.setMonth(shifted.getMonth() - 1)
      return shifted
    case 'year':
      shifted.setFullYear(shifted.getFullYear() - 1)
      return shifted
    default:
      return new Date(from.getTime() - durationMs)
  }
}

// The same elapsed slice of the previous period: a 09:00 "Today" compares against yesterday
// 00:00–09:00, not 15:00–00:00 the evening before. Rolling windows still shift by their own length.
// Shared by the KPI compare-vs-prior query and the web-analytics stat tiles.
export const priorPeriodRange = (range: TimeRange): TimeRange => {
  const durationMs = Math.max(0, range.to.getTime() - range.from.getTime())
  const from = shiftBack(range.from, priorUnit(range.from, durationMs), durationMs)
  return { from, to: new Date(from.getTime() + durationMs) }
}

export const buildComparisonQuery = (
  query: QueryRequest | undefined,
  effectiveTimeRange: TimeRange,
  compare: ComparePeriod,
): QueryRequest | undefined => {
  if (!query) return undefined
  if (compare !== ComparePeriod.PRIOR) return undefined
  // A zero/negative-length window has no meaningful prior period.
  if (effectiveTimeRange.to.getTime() <= effectiveTimeRange.from.getTime()) return undefined

  return create(QueryRequestSchema, {
    ...query,
    timeRange: create(TimeRangeSchema, toProtoTimeRange(priorPeriodRange(effectiveTimeRange))),
  })
}

const PRIOR_UNIT_LABELS: Record<Exclude<PriorUnit, 'duration'>, string> = {
  day: 'vs prior day',
  week: 'vs prior week',
  month: 'vs prior month',
  year: 'vs prior year',
}

// Reads the unit off priorPeriodRange's own rule, so the badge can't name a period the query didn't use.
export const formatComparePeriodLabel = (range: TimeRange): string => {
  const durationMs = Math.max(0, range.to.getTime() - range.from.getTime())
  const unit = priorUnit(range.from, durationMs)
  if (unit !== 'duration') return PRIOR_UNIT_LABELS[unit]

  const days = Math.round(durationMs / DAY_MS)
  if (days <= 1) return 'vs prior 24h'
  if (days < 14) return `vs prior ${days}d`
  if (days < 60) return `vs prior ${Math.round(days / 7)}w`
  return `vs prior ${Math.round(days / 30)}mo`
}
