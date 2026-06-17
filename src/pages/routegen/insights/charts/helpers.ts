import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ChartPoint } from './types'

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

/** Round v up to the next "nice" number, scaled by powers of 10, for clean Y-axis ticks. */
export const niceMax = (v: number): number => {
  if (v <= 0) return 10
  const mag = 10 ** Math.floor(Math.log10(v))
  const norm = v / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 2.5) return 2.5 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

export const computeYMax = (data: ChartPoint[], stacked = false) => {
  const allVals = stacked ? data.map(d => d.values.reduce((a, b) => a + b, 0)) : data.flatMap(d => d.values)
  return niceMax(Math.max(...allVals, 0))
}
