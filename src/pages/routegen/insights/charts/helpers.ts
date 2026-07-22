import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'

// Bucket boundaries are computed server-side in the project's reporting timezone, so
// axis/tooltip labels must render in that same zone or a day bucket (e.g. IST midnight
// = 18:30 UTC the prior day) lands under the wrong date. A malformed/unknown zone throws
// in Intl — fall back to UTC (mirrors the server's resolveEffectiveWindow) rather than
// crashing a tile.
const fmtInZone = (d: Date, timeZone: string | undefined, opts: Intl.DateTimeFormatOptions): string => {
  try {
    return d.toLocaleString('en-US', { ...opts, timeZone: timeZone || undefined })
  } catch {
    return d.toLocaleString('en-US', { ...opts, timeZone: 'UTC' })
  }
}

const yearIn = (d: Date, timeZone: string | undefined) => fmtInZone(d, timeZone, { year: 'numeric' })

// Month + day, with the year appended only when it differs from "now" in the same zone.
const fmtDay = (d: Date, timeZone: string | undefined): string => {
  const sameYear = yearIn(d, timeZone) === yearIn(new Date(), timeZone)
  return fmtInZone(d, timeZone, { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })
}

// True when the buckets don't all fall on one day in the reporting zone.
export const spansMultipleDays = (dates: readonly Date[], timeZone?: string): boolean => {
  const first = dates[0]
  if (!first) return false
  const day = fmtDay(first, timeZone)
  return dates.some(d => fmtDay(d, timeZone) !== day)
}

// withDay is required once the window crosses a day: the vendored axis treats a tick's label as its
// identity and drops repeats, so a bare "16:00" at both ends collapses the layout onto the first buckets.
export const formatAxisDate = (d: Date, granularity: Granularity, timeZone?: string, withDay = false): string => {
  if (granularity === Granularity.HOUR) {
    const clock = fmtInZone(d, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false })
    return withDay ? `${fmtDay(d, timeZone)} ${clock}` : clock
  }
  if (granularity === Granularity.MONTH) return fmtInZone(d, timeZone, { month: 'short', year: '2-digit' })
  return fmtInZone(d, timeZone, { month: 'short', day: 'numeric' })
}

// The hover pill's ticker splits a label on spaces into a month column and a day column, and drops
// any third token — "Jul 22, 02:00" renders as "Jul 22,". Joining everything after the month with
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
    const end = new Date(d)
    end.setDate(end.getDate() + 6)
    return asWholeTickerLabel(`${fmtDay(d, timeZone)} - ${fmtDay(end, timeZone)}`)
  }

  if (granularity === Granularity.MONTH) {
    const sameYear = yearIn(d, timeZone) === yearIn(new Date(), timeZone)
    return fmtInZone(d, timeZone, { month: 'long', ...(!sameYear && { year: 'numeric' }) })
  }

  return fmtDay(d, timeZone)
}
