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

/**
 * Round v up to the next "nice" number, scaled by powers of 10, for clean Y-axis ticks.
 *
 * Steps are ≤1.5× apart so a peak just over a coarse boundary (e.g. 595) no longer rounds
 * all the way up to the next power of ten (1000) — the old [1,2,2.5,5,10] ladder had 2×
 * gaps, so a peak could fill as little as ~50% of the chart height. Worst-case fill is now
 * ~67% (a peak just above a 1×10^k boundary); the 595 case rises to 600 (~99%).
 *
 * Every value emitted is a small integer multiple (3/4/5×) of a nice step, so recharts —
 * which pins the domain to [0, yMax] and fits integer ticks inside — lands even gridlines
 * exactly on yMax (e.g. 600 → 0/200/400/600). 1.5 is the finest sub-step on purpose: 1.25
 * would yield 12.5 and fractional ticks for small integer counts.
 */
export const niceMax = (v: number): number => {
  if (v <= 0) return 10
  const mag = 10 ** Math.floor(Math.log10(v))
  const norm = v / mag
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => norm <= s) ?? 10
  return step * mag
}

export const computeYMax = (data: ChartPoint[], stacked = false) => {
  const allVals = stacked ? data.map(d => d.values.reduce((a, b) => a + b, 0)) : data.flatMap(d => d.values)
  return niceMax(Math.max(...allVals, 0))
}
