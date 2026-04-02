import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { type ChartConfig } from '@/components/ui/chart'
import { SERIES_COLORS } from '../chart-colors'
import { formatAxisDate, formatTooltipDate } from './helpers'
import { type ChartPoint, type InsightsDatum } from './types'

export const buildChartConfig = (seriesNames: string[]): ChartConfig =>
  seriesNames.reduce<ChartConfig>((acc, name, si) => {
    acc[`series${si}`] = {
      label: name,
      color: SERIES_COLORS[si % SERIES_COLORS.length].line,
    }
    return acc
  }, {})

export const buildChartData = (
  data: ChartPoint[],
  seriesNames: string[],
  granularity: Granularity
): InsightsDatum[] =>
  data.map(point => {
    const row: InsightsDatum = {
      axisLabel: formatAxisDate(point.date, granularity),
      tooltipLabel: formatTooltipDate(point.date, granularity),
    }

    seriesNames.forEach((_, si) => {
      row[`series${si}`] = point.values[si] ?? 0
    })

    return row
  })

export const formatTooltipLabel = (_: unknown, payload: Array<Record<string, unknown>> = []) => {
  const entry = payload[0] as { payload?: InsightsDatum } | undefined
  return entry?.payload?.tooltipLabel ?? ''
}
