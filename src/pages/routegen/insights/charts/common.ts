import { useMemo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ChartConfig } from '@/components/ui/chart'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { computeYMax, formatAxisDate, formatTooltipDate } from './helpers'
import type { ChartPoint, InsightsDatum } from './types'

export const buildChartConfig = (seriesNames: string[], seriesColors: SeriesColor[]): ChartConfig =>
  seriesNames.reduce<ChartConfig>((acc, name, si) => {
    acc[`series${si}`] = {
      label: name,
      color: seriesColors[si]?.line,
    }
    return acc
  }, {})

export const buildChartData = (
  data: ChartPoint[],
  seriesNames: string[],
  granularity: Granularity,
): InsightsDatum[] => {
  let warned = false
  return data.map(point => {
    if (!warned && point.values.length !== seriesNames.length) {
      console.error(
        'Chart data misalignment: expected',
        seriesNames.length,
        'values per point, got',
        point.values.length,
      )
      warned = true
    }

    const row: InsightsDatum = {
      axisLabel: formatAxisDate(point.date, granularity),
      tooltipLabel: formatTooltipDate(point.date, granularity),
    }

    seriesNames.forEach((_, si) => {
      row[`series${si}`] = point.values[si] ?? 0
    })

    return row
  })
}

export const formatTooltipLabel = (_: unknown, payload: Array<Record<string, unknown>> = []) => {
  const entry = payload[0] as { payload?: InsightsDatum } | undefined
  return entry?.payload?.tooltipLabel ?? ''
}

export const useChartPrep = (
  data: ChartPoint[],
  seriesNames: string[],
  seriesColors: SeriesColor[],
  granularity: Granularity,
  stacked?: boolean,
) => ({
  chartConfig: useMemo(() => buildChartConfig(seriesNames, seriesColors), [seriesNames, seriesColors]),
  chartData: useMemo(() => buildChartData(data, seriesNames, granularity), [data, seriesNames, granularity]),
  yMax: useMemo(() => computeYMax(data, stacked), [data, stacked]),
})

export const SHARED_MARGIN = { top: 12, right: 8, left: 0, bottom: 8 }

export const SHARED_X_AXIS = {
  dataKey: 'axisLabel' as const,
  tickLine: false,
  axisLine: false,
  minTickGap: 24,
  interval: 'preserveStartEnd' as const,
}

type YAxisOptions = {
  logScale?: boolean
  zeroBaseline?: boolean
  tickFormatter?: (value: number) => string
}

export const sharedYAxis = (yMax: number, opts?: YAxisOptions) => {
  const base = {
    tickLine: false,
    axisLine: false,
    width: 44,
    // A custom formatter (percent, duration) maps fractional values to readable
    // ticks, so don't force integer ticks — that would collapse a 0–1 ratio axis.
    allowDecimals: opts?.tickFormatter !== undefined,
    tickFormatter: opts?.tickFormatter ?? compactNumber,
  }
  // Log scale can't include 0, so float the min and let recharts pick it.
  if (opts?.logScale) {
    return { ...base, scale: 'log' as const, domain: [1, 'auto'] as [number, string], allowDataOverflow: true }
  }
  // Only drop the zero floor when the caller explicitly opts out — the Insights
  // page passes no options and keeps the historical zero-based axis.
  if (opts?.zeroBaseline === false) {
    return { ...base, domain: ['auto', yMax] as [string, number] }
  }
  return { ...base, domain: [0, yMax] as [number, number] }
}
