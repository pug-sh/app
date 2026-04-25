import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { type ChartConfig } from '@/components/ui/chart'
import { compactNumber } from '@/lib/format'
import type { SeriesColor } from '@/lib/event-colors'
import { useMemo } from 'react'
import { computeYMax } from './helpers'
import { formatAxisDate, formatTooltipDate } from './helpers'
import { type ChartPoint, type InsightsDatum } from './types'

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
  granularity: Granularity
): InsightsDatum[] => {
  let warned = false
  return data.map(point => {
    if (!warned && point.values.length !== seriesNames.length) {
      console.error(
        'Chart data misalignment: expected',
        seriesNames.length,
        'values per point, got',
        point.values.length
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
  stacked?: boolean
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

export const sharedYAxis = (yMax: number) => ({
  tickLine: false,
  axisLine: false,
  width: 44,
  domain: [0, yMax] as [number, number],
  allowDecimals: false,
  tickFormatter: compactNumber,
})
