import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { zonedCivil } from '@/lib/timezone'

// Bucket boundaries are computed server-side in the project's reporting timezone, so
// axis/tooltip labels must render in that same zone or a day bucket (e.g. IST midnight
// = 18:30 UTC the prior day) lands under the wrong date. A malformed/unknown zone throws
// in Intl, so fall back to UTC (mirrors the server's resolveEffectiveWindow) rather than
// crashing a tile. Cached because toLocaleString builds a new formatter on every call.
const formatters = new Map<string, Intl.DateTimeFormat>()
const fmtInZone = (d: Date, timeZone: string | undefined, opts: Intl.DateTimeFormatOptions): string => {
  const key = `${timeZone ?? ''}|${JSON.stringify(opts)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: timeZone || undefined })
    } catch {
      formatter = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })
    }
    formatters.set(key, formatter)
  }
  return formatter.format(d)
}

const yearIn = (d: Date, timeZone: string | undefined) => fmtInZone(d, timeZone, { year: 'numeric' })

// Month + day, with the year appended only when it differs from "now" in the same zone.
const fmtDay = (d: Date, timeZone: string | undefined): string => {
  const sameYear = yearIn(d, timeZone) === yearIn(new Date(), timeZone)
  return fmtInZone(d, timeZone, { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })
}

// fmtDay for a date `days` calendar days later in the reporting zone. Read off the civil date
// rather than an instant: elapsed ms drifts when that zone's clocks go back inside the span, and
// the wall clock it would rebuild doesn't exist in a zone that springs forward at midnight.
const fmtDayAfter = (d: Date, days: number, timeZone: string | undefined): string => {
  try {
    const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
    const c = zonedCivil(d, zone)
    const cal = new Date(Date.UTC(c.year, c.month - 1, c.day + days))
    const sameYear = String(cal.getUTCFullYear()) === yearIn(new Date(), zone)
    return fmtInZone(cal, 'UTC', { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })
  } catch {
    const shifted = new Date(d)
    shifted.setDate(shifted.getDate() + days)
    return fmtDay(shifted, timeZone)
  }
}

// True when the buckets don't all fall on one day in the reporting zone.
export const spansMultipleDays = (dates: readonly Date[], timeZone?: string): boolean => {
  const first = dates[0]
  if (!first) return false
  const day = fmtDay(first, timeZone)
  return dates.some(d => fmtDay(d, timeZone) !== day)
}

// withDay is required once the window crosses a day: the vendored axis drops a tick whose label it has
// already drawn, so a bare "16:00" at both ends loses the last one.
export const formatAxisDate = (d: Date, granularity: Granularity, timeZone?: string, withDay = false): string => {
  if (granularity === Granularity.HOUR) {
    const clock = fmtInZone(d, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false })
    return withDay ? `${fmtDay(d, timeZone)} ${clock}` : clock
  }
  if (granularity === Granularity.MONTH) return fmtInZone(d, timeZone, { month: 'short', year: '2-digit' })
  return fmtInZone(d, timeZone, { month: 'short', day: 'numeric' })
}

// Measured off Figtree at text-xs, worst case: an all-digit clock ("00:00") runs 7.0px/char, well
// above the ~4.9px of a label with spaces. Fitting to the average overprints exactly the labels
// that are hardest to read, so this tracks the widest, not the mean. Re-measure on a face change.
// Exported because the Sankey sizes its label gutters off the same figure: CLAUDE.md requires a
// re-measure per face, and two private copies is one of them silently keeping the old value.
export const AXIS_LABEL_PX_PER_CHAR = 7.0
const AXIS_LABEL_MIN_GAP_PX = 16

// The vendored axis scores tick layouts on how even they look, never on whether the labels fit, and
// may take one more tick than asked, so neighbours could land closer than a label is wide. This picks
// the smallest constant stride (at most `maxTicks` ticks) whose labels clear each other at the
// positions they are drawn at. Blank labels are bar padding rows and never take a tick.
export const pickAxisTicks = (labels: readonly string[], xs: readonly number[], maxTicks: number) => {
  const real = labels.flatMap((label, i) => (label === '' ? [] : [i]))
  if (real.length <= 1) return real

  const clears = (picked: number[]) =>
    picked.every((index, k) => {
      if (k === 0) return true
      const prev = picked[k - 1]
      const room = ((labels[prev].length + labels[index].length) / 2) * AXIS_LABEL_PX_PER_CHAR + AXIS_LABEL_MIN_GAP_PX
      return xs[index] - xs[prev] >= room
    })

  for (let stride = 1; stride < real.length; stride++) {
    const picked = real.filter((_, k) => k % stride === 0)
    if (picked.length <= maxTicks && clears(picked)) return picked
  }
  return [real[0]]
}

// The hover pill's ticker splits a label on spaces into a month column and a day column, and drops
// any third token: "Jul 22, 02:00" renders as "Jul 22,". Joining everything after the month with
// NBSP keeps it one token; it renders identically.
const asTickerLabel = (label: string) => {
  const [month, ...rest] = label.split(' ')
  return rest.length > 0 ? `${month} ${rest.join('\u00a0')}` : label
}

// A range already names its own months, so letting the ticker hoist the first one into the month
// column leaves "Jun  21 - Jun 27" split across two columns. One token keeps it in a single column.
const asWholeTickerLabel = (label: string) => label.replaceAll(' ', '\u00a0')

export const formatTooltipDate = (d: Date, granularity: Granularity, timeZone?: string): string => {
  if (granularity === Granularity.HOUR) {
    const clock = fmtInZone(d, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false })
    return asTickerLabel(`${fmtDay(d, timeZone)}, ${clock}`)
  }

  if (granularity === Granularity.WEEK) {
    return asWholeTickerLabel(`${fmtDay(d, timeZone)} - ${fmtDayAfter(d, 6, timeZone)}`)
  }

  if (granularity === Granularity.MONTH) {
    const sameYear = yearIn(d, timeZone) === yearIn(new Date(), timeZone)
    return fmtInZone(d, timeZone, { month: 'long', ...(!sameYear && { year: 'numeric' }) })
  }

  // Wrapped too: fmtDay appends the year outside the current one, and "Dec 15, 2025" is three tokens.
  return asTickerLabel(fmtDay(d, timeZone))
}

export const formatTooltipTitle = (d: Date, timeZone?: string) =>
  fmtInZone(d, timeZone, { weekday: 'short', month: 'short', day: 'numeric' })
