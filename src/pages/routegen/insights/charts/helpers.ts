import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { fmtDate } from '@/lib/date-presets'
import type { ChartPoint } from './types'

export const formatAxisDate = (d: Date, granularity: Granularity): string => {
  if (granularity === Granularity.HOUR)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (granularity === Granularity.MONTH) return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const formatTooltipDate = (d: Date, granularity: Granularity): string => {
  if (granularity === Granularity.HOUR)
    return fmtDate(d) + ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

  if (granularity === Granularity.WEEK) {
    const end = new Date(d)
    end.setDate(end.getDate() + 6)
    return fmtDate(d) + ' - ' + fmtDate(end)
  }

  if (granularity === Granularity.MONTH) {
    const thisYear = new Date().getFullYear()
    return d.toLocaleDateString('en-US', { month: 'long', ...(d.getFullYear() !== thisYear && { year: 'numeric' }) })
  }

  return fmtDate(d)
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
