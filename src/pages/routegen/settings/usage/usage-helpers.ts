import type { UsageDay } from '@/api/genproto/dashboard/usage/v1/usage_pb'
import { getIndexedColor } from '@/lib/event-colors'
import { tsToDate } from '@/lib/timestamp'
import type { ChartPoint } from '../../insights/charts/types'

export const DAY_MS = 24 * 60 * 60 * 1000

// Usage is UTC end to end. date-presets.ts anchors on local midnight, so none of it is reusable
// here — west of UTC it would date every cell a day early, east of UTC a day late.
const floorUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

// protobuf-es hands back an Invalid Date for an out-of-range int64 rather than throwing, so
// tsToDate's own try/catch never fires and a bare null check passes it straight through. It then
// throws RangeError inside Intl.DateTimeFormat.format() — during render, where it takes out the
// whole routed page rather than one label. Every Timestamp this feature reads goes through here.
export const validDate = (d: Date | null) => {
  if (!d || Number.isNaN(d.getTime())) return null
  return d
}

// Half-open [from, to), matching the server. `to` is the midnight after today, so today is in.
export const lastNUtcDays = (days: RangeDays) => {
  const end = floorUtcDay(new Date()).getTime() + DAY_MS
  return { from: new Date(end - days * DAY_MS), to: new Date(end) }
}

// All under the request's 400-day cap (get_usage.range_max in usage.proto) and inside the meter's
// retention, which the proto no longer states — it is `retention` in the backend's cron/usage,
// currently 390 days. Nothing mechanical ties these to either, so re-check both when adding one.
export const RANGE_OPTIONS = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '6 months', value: 180 },
  { label: '12 months', value: 365 },
] as const

// Annotate the state with this rather than leaning on inference. `as const` makes
// DEFAULT_RANGE_DAYS a non-fresh literal, and those are not widened, so `useState(DEFAULT_RANGE_DAYS)`
// infers `useState<30>` and every other preset stops compiling at onChange. Typing it `number`
// instead would go the other way and make an off-list range representable, which the server accepts
// (its only range rule is the 400-day span) and the chip renders as a bare number.
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

// Days in the window past the meter's last pass have no rows, so the day loop fills them with 0 —
// indistinguishable from a day that genuinely had no events. On a billing page that misreads a
// stopped meter as a usage collapse, so the count is surfaced instead of left looking like data.
export const unmeteredTailDays = (range: { from: Date; to: Date }, meteredAt: Date | null) => {
  if (!meteredAt) return 0
  const meteredThrough = floorUtcDay(meteredAt).getTime() + DAY_MS
  if (range.to.getTime() <= meteredThrough) return 0
  return Math.ceil((range.to.getTime() - meteredThrough) / DAY_MS)
}

// Why a cell was refused. `outOfWindow` is the only one that isn't a defect in the cell itself.
type RejectReason = 'unreadableDay' | 'outOfWindow' | 'noProject' | 'badCount' | 'duplicate'

export type RejectedCell = { reason: RejectReason; projectId: string; day: unknown }

// "3 unreadable cells" is not something anyone can act on. A few examples are.
const REJECTED_SAMPLE_MAX = 3

// Cells are per (project, day) and a day a project sent nothing has no row at all. Emits one point
// per UTC day across the whole window, gaps included: the vendored chart sizes bars from the number
// of rows it is handed but places each one by timestamp, so a sparse series draws bars far wider
// than the day they cover and neighbours overdraw. The row count reaches the bars through the
// shell's `columnWidth` (innerWidth / (visiblePlotData.length - 1), time-series-chart-shell.tsx),
// which computeSeriesBarWidth then takes as its slot — note that helper's own `dataLength` argument
// is only its columnWidth <= 0 fallback, so reading series-bar-layout.ts alone will suggest
// otherwise. Re-check both after a re-vendor.
//
// Nothing here trusts the response's shape. Every rejected cell is counted rather than dropped,
// because silence on a metering surface is the worst failure available: a partly bad response
// understates the total, and a wholly bad one leaves projectTotals empty — which the page would
// otherwise render as "no metered events", asserting zero usage. Two counters, because they say
// different things to the reader:
//
//   `malformed`   — the cell cannot be used as given: no readable day, no project to attribute it
//                   to, a count that isn't a non-negative number, or a repeat of a (project, day)
//                   the response already sent.
//   `outOfWindow` — the cell reads fine but falls outside `range`. Keeps totals from ever
//                   describing a wider window than the points do. This should be unreachable
//                   (`lastNUtcDays` always asks on whole-UTC-day bounds, so the server's outward
//                   snap is the identity) — which is exactly why it must be reported if it happens.
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
  let outOfWindow = 0
  const rejected: RejectedCell[] = []

  const reject = (reason: RejectReason, cell: UsageDay) => {
    if (reason === 'outOfWindow') outOfWindow++
    else malformed++
    if (rejected.length < REJECTED_SAMPLE_MAX) {
      rejected.push({ reason, projectId: cell.projectId, day: cell.day })
    }
  }

  for (const cell of daily) {
    // An Invalid Date is truthy and compares false against everything, so it would pass a bare
    // `!day`, slip through the range test below, and only blow up later in utcDayKey's toISOString.
    const day = validDate(tsToDate(cell.day))
    if (!day) {
      reject('unreadableDay', cell)
      continue
    }
    const dayMs = floorUtcDay(day).getTime()
    if (dayMs < fromMs || dayMs >= toMs) {
      reject('outOfWindow', cell)
      continue
    }

    // proto3 defaults an omitted string to '', which is a perfectly good Map key — every
    // unattributed cell would collapse into one bucket and render as a project whose id is blank.
    if (!cell.projectId) {
      reject('noProject', cell)
      continue
    }

    // int64 → number: these feed chart values and percentages, so a number is what the consumers
    // want. usedEvents on the page stays a bigint. A negative count would subtract from the window
    // total and hand the share column a negative percentage, so it is malformed, not data. Above
    // 2^53 the conversion also quietly loses precision while still passing isFinite — unreachable
    // for event counts, but it is the ceiling this line carries.
    const count = Number(cell.eventCount)
    if (!Number.isFinite(count) || count < 0) {
      reject('badCount', cell)
      continue
    }

    const key = utcDayKey(day)
    let row = byDay.get(key)
    if (!row) {
      row = new Map()
      byDay.set(key, row)
    }
    // UsageDay is *one* (project, day) cell, so a repeat is an out-of-contract response. Summing it
    // would silently overstate — every other check here catches a defect that understates, making
    // this the only path that can inflate a bill — so the repeat is refused and reported instead.
    if (row.has(cell.projectId)) {
      reject('duplicate', cell)
      continue
    }
    row.set(cell.projectId, count)
    totals.set(cell.projectId, (totals.get(cell.projectId) ?? 0) + count)
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
    outOfWindow,
    rejected,
    windowTotal: projectTotals.reduce((sum, p) => sum + p.total, 0),
  }
}

// Projects are a breakdown dimension, so colored by index rather than by name. Takes the names
// rather than a count so the call site reads "colors for these series" — ProjectTotal.seriesIndex
// indexes into this array, and a length sourced from anywhere else would silently misalign it.
export const usageSeriesColors = (names: string[]) => names.map((_, i) => getIndexedColor(i))
