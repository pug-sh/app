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

// All under the request's 400-day cap (usage.proto's CEL constraint) and inside the meter's
// ~13-month retention.
export const RANGE_OPTIONS = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '6 months', value: 180 },
  { label: '12 months', value: 365 },
] as const

// Type the range state with this, not `number`: useState widens a literal initial value, which
// widens OptionChip's generic too and makes an off-list range representable — the server then
// rejects it and the chip renders the bare number.
export type RangeDays = (typeof RANGE_OPTIONS)[number]['value']

// Derived from the list so the default can never fall out of it.
export const DEFAULT_RANGE_DAYS = RANGE_OPTIONS[0].value

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

export type ProjectTotal = {
  projectId: string
  name: string
  total: number
  // Index into `names`, and so into the colors built from it — null once the project falls into the
  // folded band. Carried on the row so the table can be sorted or filtered without its dots
  // silently pointing at another project's series.
  seriesIndex: number | null
}

const utcDayKey = (d: Date) => d.toISOString().slice(0, 10)

// Cells are per (project, day) and a day a project sent nothing has no row at all. Emits one point
// per UTC day across the whole window, gaps included: the vendored chart sizes bars from the number
// of rows it is handed but places each one by timestamp, so a sparse series draws bars far wider
// than the day they cover and neighbours overdraw. (Sizing: computeSeriesBarWidth in
// components/charts/series-bar-layout.ts — re-check after a re-vendor.)
//
// Cells outside `range` are dropped rather than counted, so the totals can never describe a wider
// window than the points do. Belt and braces since the response now carries the range it was
// fetched with; it also covers a range that isn't whole-UTC-day aligned, where the server snaps its
// bounds outwards.
//
// `malformed` counts cells this cannot read. They must be reported rather than dropped: silently,
// a bad response understates the total, and a wholly bad one leaves projectTotals empty — which the
// page would otherwise render as "no metered events", asserting zero usage on a billing surface.
export const buildUsageSeries = (
  daily: UsageDay[],
  range: { from: Date; to: Date },
  projectName: (id: string) => string,
) => {
  const totals = new Map<string, number>()
  const byDay = new Map<string, Map<string, number>>()
  const fromMs = floorUtcDay(range.from).getTime()
  const toMs = range.to.getTime()
  let malformed = 0

  for (const cell of daily) {
    // An out-of-range stamp comes back as an Invalid Date rather than throwing, and an Invalid Date
    // is truthy — it would pass a bare `!day`, defeat the range test below (NaN compares false both
    // ways) and only blow up later inside utcDayKey's toISOString().
    const day = tsToDate(cell.day)
    if (!day || Number.isNaN(day.getTime())) {
      malformed++
      continue
    }
    const dayMs = floorUtcDay(day).getTime()
    if (dayMs < fromMs || dayMs >= toMs) continue

    // int64 → number: these feed chart values and percentages, so a number is what the consumers
    // want. usedEvents on the page stays a bigint. A negative count would subtract from the window
    // total and hand the share column a negative percentage, so it is malformed, not data.
    const count = Number(cell.eventCount)
    if (!Number.isFinite(count) || count < 0) {
      malformed++
      continue
    }
    totals.set(cell.projectId, (totals.get(cell.projectId) ?? 0) + count)

    const key = utcDayKey(day)
    let row = byDay.get(key)
    if (!row) {
      row = new Map()
      byDay.set(key, row)
    }
    row.set(cell.projectId, (row.get(cell.projectId) ?? 0) + count)
  }

  // Id breaks ties, not name: projectName falls back to an id fragment until projectsAtom fills, so
  // a name-keyed sort reorders mid-page — and this order is the color assignment.
  const ranked = [...totals.entries()]
    .map(([projectId, total]) => ({ projectId, name: projectName(projectId), total }))
    .sort((a, b) => b.total - a.total || a.projectId.localeCompare(b.projectId))

  const projectTotals: ProjectTotal[] = ranked.map((p, i) => ({
    ...p,
    seriesIndex: i < MAX_CHART_SERIES ? i : null,
  }))

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
    malformed,
    windowTotal: projectTotals.reduce((sum, p) => sum + p.total, 0),
  }
}

// Projects are a breakdown dimension, so colored by index rather than by name.
export const usageSeriesColors = (count: number) => Array.from({ length: count }, (_, i) => getIndexedColor(i))
