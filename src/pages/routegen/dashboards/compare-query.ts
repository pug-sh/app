import { create } from '@bufbuild/protobuf'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { ComparePeriod } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { type QueryRequest, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { toProtoTimeRange } from '@/lib/timestamp'
import { civilToInstant, type ZonedCivil, zonedCivil } from '@/lib/timezone'

const DAY_MS = 24 * 60 * 60 * 1000

// Finest-first: priorUnit takes the first that fits.
const CALENDAR_UNITS = ['day', 'week', 'month', 'year'] as const

type CalendarUnit = (typeof CALENDAR_UNITS)[number]
type PriorUnit = CalendarUnit | 'duration'

// The window actually sent beside the one the user picked, read in the project's reporting zone.
export interface CompareWindow {
  queried: TimeRange
  selected: TimeRange
  timeZone: string
}

const isCivilMidnight = (c: ZonedCivil) => !c.hour && !c.minute && !c.second && !c.ms

// A UTC date used purely as a calendar, so no DST rule applies.
const civilDayOfWeek = (c: ZonedCivil) => new Date(Date.UTC(c.year, c.month - 1, c.day)).getUTCDay()

// Keyed by unit so adding one is a compile error, not a silently wrong answer.
const UNIT_STARTS: Record<CalendarUnit, (c: ZonedCivil) => boolean> = {
  day: () => true,
  // Monday-anchored, matching the presets this classifies (the server's chart buckets start Sunday).
  week: c => civilDayOfWeek(c) === 1,
  month: c => c.day === 1,
  year: c => c.month === 1 && c.day === 1,
}

const UNIT_STEPS: Record<CalendarUnit, { days: number; months: number }> = {
  day: { days: 1, months: 0 },
  week: { days: 7, months: 0 },
  month: { days: 0, months: 1 },
  year: { days: 0, months: 12 },
}

// Civil arithmetic in the reporting zone: a DST day is 23 or 25 hours, February is short.
const shiftCalendar = (d: Date, unit: CalendarUnit, steps: number, timeZone: string) => {
  const c = zonedCivil(d, timeZone)
  const { days, months } = UNIT_STEPS[unit]
  const cal = new Date(Date.UTC(c.year, c.month - 1, c.day))
  cal.setUTCDate(cal.getUTCDate() + days * steps)
  if (months) {
    cal.setUTCMonth(cal.getUTCMonth() + months * steps)
    // Month and year overflow forward out of a shorter target (Mar 31 → Feb 31 → Mar 3).
    if (cal.getUTCDate() !== c.day) cal.setUTCDate(0)
  }
  const shifted = { ...c, year: cal.getUTCFullYear(), month: cal.getUTCMonth() + 1, day: cal.getUTCDate() }
  return civilToInstant(shifted, timeZone)
}

// The calendar period a window is a slice of: the smallest unit it starts on and still fits inside.
// Measured by advancing the start a whole unit, or a 25-hour "Yesterday" reads as rolling.
const priorUnit = ({ selected, timeZone }: CompareWindow): PriorUnit => {
  const from = zonedCivil(selected.from, timeZone)
  if (!isCivilMidnight(from)) return 'duration'
  const unit = CALENDAR_UNITS.find(
    u => UNIT_STARTS[u](from) && selected.to <= shiftCalendar(selected.from, u, 1, timeZone),
  )
  return unit ?? 'duration'
}

// The same elapsed slice of the previous period: a 09:00 "Today" compares against yesterday
// 00:00–09:00. The unit comes off `selected`, since flooring can park a rolling start on a boundary.
export const priorPeriodRange = (compareWindow: CompareWindow): TimeRange => {
  const { queried, timeZone } = compareWindow
  const unit = priorUnit(compareWindow)
  // Both endpoints move, so a shorter prior period can't reach into the current one.
  if (unit !== 'duration') {
    return {
      from: shiftCalendar(queried.from, unit, -1, timeZone),
      to: shiftCalendar(queried.to, unit, -1, timeZone),
    }
  }

  const durationMs = Math.max(0, queried.to.getTime() - queried.from.getTime())
  return { from: new Date(queried.from.getTime() - durationMs), to: new Date(queried.from) }
}

export const buildComparisonQuery = (
  query: QueryRequest | undefined,
  compareWindow: CompareWindow,
  compare: ComparePeriod,
): QueryRequest | undefined => {
  if (!query) return undefined
  if (compare !== ComparePeriod.PRIOR) return undefined
  const { queried } = compareWindow
  // A zero/negative-length window has no meaningful prior period.
  if (queried.to.getTime() <= queried.from.getTime()) return undefined

  return create(QueryRequestSchema, {
    ...query,
    timeRange: create(TimeRangeSchema, toProtoTimeRange(priorPeriodRange(compareWindow))),
  })
}

const PRIOR_UNIT_LABELS: Record<CalendarUnit, string> = {
  day: 'vs prior day',
  week: 'vs prior week',
  month: 'vs prior month',
  year: 'vs prior year',
}

// Reads the unit off priorPeriodRange's own rule, so the badge can't name a period the query didn't use.
export const formatComparePeriodLabel = (compareWindow: CompareWindow) => {
  const unit = priorUnit(compareWindow)
  if (unit !== 'duration') return PRIOR_UNIT_LABELS[unit]

  const { queried } = compareWindow
  const days = Math.round(Math.max(0, queried.to.getTime() - queried.from.getTime()) / DAY_MS)
  if (days <= 1) return 'vs prior 24h'
  if (days < 14) return `vs prior ${days}d`
  if (days < 60) return `vs prior ${Math.round(days / 7)}w`
  return `vs prior ${Math.round(days / 30)}mo`
}
