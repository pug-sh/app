import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import type { DatePreset, TimeRange } from '@/components/date-range-picker'

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

// Midnight-to-now, behind the 'Today' preset.
export const todayRange = (): TimeRange => ({ from: startOfDay(new Date()), to: new Date() })

// Elapsed hours, not wall-clock: setHours spans 25 real hours across a fall-back day, 23 across a
// spring-forward one.
const lastNHours = (n: number): TimeRange => {
  const now = new Date()
  return { from: new Date(now.getTime() - n * 60 * 60 * 1000), to: now }
}

// Shared by the 'Last 24 hours' preset and the Overview default landing window, so the two never
// drift and neither hard-codes a preset-label lookup.
export const last24HoursRange = (): TimeRange => ({ ...lastNHours(24), label: 'Last 24 hours' })

const lastNDays = (n: number): TimeRange => {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - n)
  return { from: startOfDay(from), to: now }
}

const lastNMonths = (n: number): TimeRange => {
  const now = new Date()
  const from = new Date(now)
  from.setMonth(from.getMonth() - n)
  // setMonth overflows forward when the target month is shorter (May 31 → Feb 31 → Mar 3).
  if (from.getDate() !== now.getDate()) from.setDate(0)
  // +1 day so the window spans exactly n months of buckets. Without it "Last 12 months" is 365
  // days plus today's elapsed hours, over the backend's 365-day cap for Day granularity.
  from.setDate(from.getDate() + 1)
  return { from: startOfDay(from), to: now }
}

const yesterday = (): TimeRange => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return { from: startOfDay(d), to: endOfDay(d) }
}

// Monday-anchored, matching the ISO week the server buckets on.
const startOfWeek = (d: Date) => {
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return startOfDay(monday)
}

const thisWeek = (): TimeRange => ({ from: startOfWeek(new Date()), to: new Date() })

const lastWeek = (): TimeRange => {
  const thisMonday = startOfWeek(new Date())
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const lastSunday = new Date(thisMonday)
  lastSunday.setDate(thisMonday.getDate() - 1)
  return { from: lastMonday, to: endOfDay(lastSunday) }
}

const thisMonth = (): TimeRange => {
  const now = new Date()
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
}

const lastMonth = (): TimeRange => {
  const now = new Date()
  // Day 0 of this month is the last day of the previous one.
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: endOfDay(lastDay) }
}

const thisYear = (): TimeRange => {
  const now = new Date()
  return { from: new Date(now.getFullYear(), 0, 1), to: now }
}

// One list behind every page-level picker, so a range offered on one page is offered on all.
// Rolling first, then calendar-anchored next to its previous-period counterpart.
export const TIME_RANGE_PRESETS: DatePreset[] = [
  { label: 'Last 24 hours', resolve: last24HoursRange },
  { label: 'Today', resolve: todayRange },
  { label: 'Yesterday', resolve: yesterday },
  { label: 'Last 7 days', resolve: () => lastNDays(7) },
  { label: 'Last 14 days', resolve: () => lastNDays(14) },
  { label: 'Last 30 days', resolve: () => lastNDays(30) },
  { label: 'Last 3 months', resolve: () => lastNMonths(3) },
  { label: 'Last 6 months', resolve: () => lastNMonths(6) },
  { label: 'Last 12 months', resolve: () => lastNMonths(12) },
  { label: 'This week', resolve: thisWeek },
  { label: 'Last week', resolve: lastWeek },
  { label: 'This month', resolve: thisMonth },
  { label: 'Last month', resolve: lastMonth },
  { label: 'This year', resolve: thisYear },
]

// Named, not TIME_RANGE_PRESETS[0], so reordering the list can't move Insights' landing window.
export const DEFAULT_INSIGHTS_RANGE = () => lastNDays(7)

export const DEFAULT_DASHBOARD_TIME_RANGE_PRESET = TimeRangePreset.LAST_7_DAYS

export const DASHBOARD_TIME_RANGE_PRESETS = [
  { label: '1 hour', value: TimeRangePreset.LAST_1_HOUR, resolve: () => lastNHours(1) },
  { label: '6 hours', value: TimeRangePreset.LAST_6_HOURS, resolve: () => lastNHours(6) },
  { label: '1 day', value: TimeRangePreset.LAST_24_HOURS, resolve: () => lastNHours(24) },
  { label: '1 week', value: TimeRangePreset.LAST_7_DAYS, resolve: () => lastNDays(7) },
  { label: '2 weeks', value: TimeRangePreset.LAST_14_DAYS, resolve: () => lastNDays(14) },
  { label: '1 month', value: TimeRangePreset.LAST_30_DAYS, resolve: () => lastNDays(30) },
  { label: '3 months', value: TimeRangePreset.LAST_90_DAYS, resolve: () => lastNDays(90) },
  { label: '6 months', value: TimeRangePreset.LAST_180_DAYS, resolve: () => lastNDays(180) },
  { label: '1 year', value: TimeRangePreset.LAST_365_DAYS, resolve: () => lastNDays(365) },
] as const

export const isDashboardTimeRangePreset = (
  preset: TimeRangePreset | undefined,
): preset is (typeof DASHBOARD_TIME_RANGE_PRESETS)[number]['value'] =>
  preset !== undefined && DASHBOARD_TIME_RANGE_PRESETS.some(option => option.value === preset)

export const getDashboardTimeRangePresetLabel = (preset: TimeRangePreset | undefined) =>
  DASHBOARD_TIME_RANGE_PRESETS.find(item => item.value === preset)?.label ??
  DASHBOARD_TIME_RANGE_PRESETS.find(item => item.value === DEFAULT_DASHBOARD_TIME_RANGE_PRESET)!.label

export const resolveDashboardTimeRangePreset = (
  preset: TimeRangePreset | undefined,
  fallback?: TimeRange,
): TimeRange => {
  const option = DASHBOARD_TIME_RANGE_PRESETS.find(item => item.value === preset)
  if (option) return option.resolve()
  if (fallback) return fallback
  return DASHBOARD_TIME_RANGE_PRESETS.find(item => item.value === DEFAULT_DASHBOARD_TIME_RANGE_PRESET)!.resolve()
}

export const fmtDate = (d: Date) => {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })
}

export const defaultRange = thisMonth
