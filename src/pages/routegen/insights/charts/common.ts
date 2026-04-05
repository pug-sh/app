import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { type ChartConfig } from '@/components/ui/chart'
import type { SeriesColor } from '@/lib/event-colors'
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
      console.warn('Chart data misalignment: expected', seriesNames.length, 'values per point, got', point.values.length)
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
