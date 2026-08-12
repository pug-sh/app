import type { UsageDay } from '@/api/genproto/dashboard/usage/v1/usage_pb'
import { getIndexedColor } from '@/lib/event-colors'
import { tsToDate } from '@/lib/timestamp'
import type { ChartPoint } from '../../insights/charts/types'

export const DAY_MS = 24 * 60 * 60 * 1000

// Usage is UTC end to end. date-presets.ts anchors on local midnight, so none of it is reusable
// here — west of UTC it would date every cell a day early.
const floorUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

// Half-open [from, to), matching the server. `to` is the midnight after today, so today is in.
export const lastNUtcDays = (days: number) => {
  const end = floorUtcDay(new Date()).getTime() + DAY_MS
  return { from: new Date(end - days * DAY_MS), to: new Date(end) }
}

// All under the request's 400-day cap and inside the meter's ~13-month retention.
export const RANGE_OPTIONS = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '6 months', value: 180 },
  { label: '12 months', value: 365 },
] as const

export const DEFAULT_RANGE_DAYS = 30

const utcFormat = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })

const DAY_FMT = utcFormat({ month: 'short', day: 'numeric', year: 'numeric' })
const DAY_NO_YEAR_FMT = utcFormat({ month: 'short', day: 'numeric' })
const STAMP_FMT = utcFormat({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

export const formatUtcStamp = (d: Date) => `${STAMP_FMT.format(d)} UTC`

// periodEnd is exclusive — the 1st of the next month.
export const formatPeriod = (start: Date, end: Date) =>
  `${DAY_NO_YEAR_FMT.format(start)} – ${DAY_FMT.format(new Date(end.getTime() - DAY_MS))}`

const MAX_CHART_SERIES = 6
export const OTHERS_LABEL = 'Other projects'

export type ProjectTotal = { projectId: string; name: string; total: number }

const utcDayKey = (d: Date) => d.toISOString().slice(0, 10)

// Cells are per (project, day) and a day a project sent nothing has no row at all. Emits one point
// per UTC day across the whole window — the vendored bar width is innerWidth/(rows−1), so a
// missing row widens every bar until they overdraw.
//
// Cells outside `range` are dropped rather than counted, so the totals below can never describe a
// wider window than the points do — the two disagree otherwise while a range change is in flight.
export const buildUsageSeries = (
  daily: UsageDay[],
  range: { from: Date; to: Date },
  projectName: (id: string) => string,
) => {
  const totals = new Map<string, number>()
  const byDay = new Map<string, Map<string, number>>()
  const fromMs = floorUtcDay(range.from).getTime()
  const toMs = range.to.getTime()

  for (const cell of daily) {
    const day = tsToDate(cell.day)
    if (!day) continue
    const dayMs = floorUtcDay(day).getTime()
    if (dayMs < fromMs || dayMs >= toMs) continue
    const count = Number(cell.eventCount)
    totals.set(cell.projectId, (totals.get(cell.projectId) ?? 0) + count)

    const key = utcDayKey(day)
    let row = byDay.get(key)
    if (!row) {
      row = new Map()
      byDay.set(key, row)
    }
    row.set(cell.projectId, (row.get(cell.projectId) ?? 0) + count)
  }

  // Name breaks ties so equal-count projects don't swap colors between reloads.
  const projectTotals: ProjectTotal[] = [...totals.entries()]
    .map(([projectId, total]) => ({ projectId, name: projectName(projectId), total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))

  const charted = projectTotals.slice(0, MAX_CHART_SERIES)
  const folded = projectTotals.slice(MAX_CHART_SERIES)
  const names = charted.map(p => p.name)
  if (folded.length > 0) names.push(OTHERS_LABEL)

  const points: ChartPoint[] = []
  for (let t = fromMs; t < toMs; t += DAY_MS) {
    const row = byDay.get(utcDayKey(new Date(t)))
    const values = charted.map(p => row?.get(p.projectId) ?? 0)
    if (folded.length > 0) values.push(folded.reduce((sum, p) => sum + (row?.get(p.projectId) ?? 0), 0))
    points.push({ date: new Date(t), values })
  }

  return {
    names,
    points,
    projectTotals,
    chartedCount: charted.length,
    windowTotal: projectTotals.reduce((sum, p) => sum + p.total, 0),
  }
}

// Projects are a breakdown dimension, so colored by index rather than by name.
export const usageSeriesColors = (count: number) => Array.from({ length: count }, (_, i) => getIndexedColor(i))
