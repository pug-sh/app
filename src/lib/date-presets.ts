import type { DatePreset, TimeRange } from '@/components/date-range-picker'

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

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

export const ACTIVITY_PRESETS: DatePreset[] = [
  { label: 'Today', resolve: () => ({ from: startOfDay(new Date()), to: new Date() }) },
  {
    label: 'Yesterday',
    resolve: () => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return { from: startOfDay(d), to: endOfDay(d) }
    },
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
    resolve: () => {
      const now = new Date()
      const day = now.getDay()
      const thisMonday = new Date(now)
      thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      const lastMonday = new Date(thisMonday)
      lastMonday.setDate(thisMonday.getDate() - 7)
      const lastSunday = new Date(thisMonday)
      lastSunday.setDate(thisMonday.getDate() - 1)
      return { from: startOfDay(lastMonday), to: endOfDay(lastSunday) }
    },
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

export const fmtDate = (d: Date) => {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })
}

export const defaultRange = () => ACTIVITY_PRESETS.find(p => p.label === 'This month')!.resolve()
