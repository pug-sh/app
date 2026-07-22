import { create } from '@bufbuild/protobuf'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { ComparePeriod } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { type QueryRequest, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { toProtoTimeRange } from '@/lib/timestamp'

const DAY_MS = 24 * 60 * 60 * 1000

// Finest-first: priorUnit takes the first that fits.
const CALENDAR_UNITS = ['day', 'week', 'month', 'year'] as const

type CalendarUnit = (typeof CALENDAR_UNITS)[number]
type PriorUnit = CalendarUnit | 'duration'

const isMidnight = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0

// Civil arithmetic: a DST day is 23 or 25 hours, and February is shorter than March.
const shiftCalendar = (d: Date, unit: CalendarUnit, steps: number) => {
  const shifted = new Date(d)
  switch (unit) {
    case 'day':
      shifted.setDate(shifted.getDate() + steps)
      return shifted
    case 'week':
      shifted.setDate(shifted.getDate() + 7 * steps)
      return shifted
    case 'month':
      shifted.setMonth(shifted.getMonth() + steps)
      break
    case 'year':
      shifted.setFullYear(shifted.getFullYear() + steps)
      break
  }
  // Month and year overflow forward out of a shorter target (Mar 31 → Feb 31 → Mar 3).
  if (shifted.getDate() !== d.getDate()) shifted.setDate(0)
  return shifted
}

const startsUnit = (from: Date, unit: CalendarUnit) => {
  if (unit === 'day') return true
  // Monday-anchored, matching startOfWeek in date-presets.
  if (unit === 'week') return from.getDay() === 1
  if (unit === 'month') return from.getDate() === 1
  return from.getMonth() === 0 && from.getDate() === 1
}

// The calendar period a window is a slice of: the smallest unit it starts on and still fits inside.
// Measured by advancing the start a whole unit, or a 25-hour "Yesterday" reads as rolling.
const priorUnit = (range: TimeRange): PriorUnit => {
  if (!isMidnight(range.from)) return 'duration'
  const unit = CALENDAR_UNITS.find(u => startsUnit(range.from, u) && range.to <= shiftCalendar(range.from, u, 1))
  return unit ?? 'duration'
}

// The same elapsed slice of the previous period: a 09:00 "Today" compares against yesterday
// 00:00–09:00, not 15:00–00:00 the evening before. Rolling windows still shift by their own length.
// Shared by the KPI compare-vs-prior query and the web-analytics stat tiles.
export const priorPeriodRange = (range: TimeRange): TimeRange => {
  const unit = priorUnit(range)
  // Both endpoints move, so a shorter prior period can't reach into the current one.
  if (unit !== 'duration') {
    return { from: shiftCalendar(range.from, unit, -1), to: shiftCalendar(range.to, unit, -1) }
  }

  const durationMs = Math.max(0, range.to.getTime() - range.from.getTime())
  return { from: new Date(range.from.getTime() - durationMs), to: new Date(range.from) }
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

const PRIOR_UNIT_LABELS: Record<CalendarUnit, string> = {
  day: 'vs prior day',
  week: 'vs prior week',
  month: 'vs prior month',
  year: 'vs prior year',
}

// Reads the unit off priorPeriodRange's own rule, so the badge can't name a period the query didn't use.
export const formatComparePeriodLabel = (range: TimeRange) => {
  const unit = priorUnit(range)
  if (unit !== 'duration') return PRIOR_UNIT_LABELS[unit]

  const days = Math.round(Math.max(0, range.to.getTime() - range.from.getTime()) / DAY_MS)
  if (days <= 1) return 'vs prior 24h'
  if (days < 14) return `vs prior ${days}d`
  if (days < 60) return `vs prior ${Math.round(days / 7)}w`
  return `vs prior ${Math.round(days / 30)}mo`
}
