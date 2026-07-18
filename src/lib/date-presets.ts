import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import type { DatePreset, TimeRange } from '@/components/date-range-picker'

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

// Midnight-to-now. Shared by the 'Today' preset and the Overview web-analytics default window, so
// the two never drift and neither hard-codes a preset-label lookup.
export const todayRange = (): TimeRange => ({ from: startOfDay(new Date()), to: new Date() })

const lastNHours = (n: number): TimeRange => {
  const now = new Date()
  const from = new Date(now)
  from.setHours(from.getHours() - n)
  return { from, to: now }
}

const lastNDays = (n: number): TimeRange => {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - n)
  return { from: startOfDay(from), to: now }
}

const lastNMonths = (n: number): TimeRange => {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - n, 1)
  return { from: startOfDay(from), to: now }
}

const yesterday = (): TimeRange => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return { from: startOfDay(d), to: endOfDay(d) }
}

const lastWeek = (): TimeRange => {
  const now = new Date()
  const day = now.getDay()
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const lastSunday = new Date(thisMonday)
  lastSunday.setDate(thisMonday.getDate() - 1)
  return { from: startOfDay(lastMonday), to: endOfDay(lastSunday) }
}

export const ACTIVITY_PRESETS: DatePreset[] = [
  { label: 'Today', resolve: todayRange },
  {
    label: 'Yesterday',
    resolve: yesterday,
  },
  {
    label: 'This week',
    resolve: () => {
      const now = new Date()
      const day = now.getDay()
      const from = new Date(now)
      from.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      return { from: startOfDay(from), to: now }
    },
  },
  {
    label: 'Last week',
    resolve: lastWeek,
  },
  {
    label: 'This month',
    resolve: () => {
      const now = new Date()
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
    },
  },
  { label: 'Last 6 months', resolve: () => lastNMonths(6) },
]

export const INSIGHTS_PRESETS: DatePreset[] = [
  { label: 'Last 7 days', resolve: () => lastNDays(7) },
  { label: 'Last 14 days', resolve: () => lastNDays(14) },
  { label: 'Last 30 days', resolve: () => lastNDays(30) },
  { label: 'Last 3 months', resolve: () => lastNMonths(3) },
  { label: 'Last 6 months', resolve: () => lastNMonths(6) },
  { label: 'Last 12 months', resolve: () => lastNMonths(12) },
]

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

export const defaultRange = () => ACTIVITY_PRESETS.find(p => p.label === 'This month')!.resolve()
