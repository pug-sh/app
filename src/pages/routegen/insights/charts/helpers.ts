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

export const formatAxisDate = (d: Date, granularity: Granularity, timeZone?: string): string => {
  if (granularity === Granularity.HOUR)
    return fmtInZone(d, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false })
  if (granularity === Granularity.MONTH) return fmtInZone(d, timeZone, { month: 'short', year: '2-digit' })
  return fmtInZone(d, timeZone, { month: 'short', day: 'numeric' })
}

export const formatTooltipDate = (d: Date, granularity: Granularity, timeZone?: string): string => {
  if (granularity === Granularity.HOUR)
    return fmtDay(d, timeZone) + ', ' + fmtInZone(d, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false })

  if (granularity === Granularity.WEEK) {
    const end = new Date(d)
    end.setDate(end.getDate() + 6)
    return fmtDay(d, timeZone) + ' - ' + fmtDay(end, timeZone)
  }

  if (granularity === Granularity.MONTH) {
    const sameYear = yearIn(d, timeZone) === yearIn(new Date(), timeZone)
    return fmtInZone(d, timeZone, { month: 'long', ...(!sameYear && { year: 'numeric' }) })
  }

  return fmtDay(d, timeZone)
}
