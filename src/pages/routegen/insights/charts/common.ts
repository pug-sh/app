import { useCallback, useMemo } from 'react'
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
  timeZone: string,
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
      axisLabel: formatAxisDate(point.date, granularity, timeZone),
      tooltipLabel: formatTooltipDate(point.date, granularity, timeZone),
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
  timeZone: string,
  stacked?: boolean,
) => ({
  chartConfig: useMemo(() => buildChartConfig(seriesNames, seriesColors), [seriesNames, seriesColors]),
  chartData: useMemo(
    () => buildChartData(data, seriesNames, granularity, timeZone),
    [data, seriesNames, granularity, timeZone],
  ),
  yMax: useMemo(() => computeYMax(data, stacked), [data, stacked]),
})

// Prep shared by the vendored-chart wrappers. Unlike buildChartData, `date` stays
// a real Date — the vendored chart resolves its own labels via formatDateLabel.
export const useVendoredChartPrep = (
  data: ChartPoint[],
  seriesNames: string[],
  seriesColors: SeriesColor[],
  granularity: Granularity,
  timeZone: string,
) => {
  const chartData = useMemo(() => {
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

      const row: Record<string, unknown> = { date: point.date }
      seriesNames.forEach((_, si) => {
        row[`series${si}`] = point.values[si] ?? 0
      })
      return row
    })
  }, [data, seriesNames])

  // Without this the tooltip prints the raw dataKey ("series0") — the vendored
  // chart has no equivalent of recharts' chartConfig label map.
  const tooltipRows = useCallback(
    (point: Record<string, unknown>) =>
      seriesNames.map((name, si) => ({
        color: seriesColors[si]?.line ?? '',
        label: name,
        value: Number(point[`series${si}`] ?? 0).toLocaleString(),
      })),
    [seriesNames, seriesColors],
  )

  // Bucket labels must render in the project's reporting zone to match the
  // server-computed bucket boundaries, and vary by granularity.
  const formatDateLabel = useCallback(
    (date: Date) => formatAxisDate(date, granularity, timeZone),
    [granularity, timeZone],
  )

  return { chartData, tooltipRows, formatDateLabel }
}

export const SHARED_MARGIN = { top: 12, right: 8, left: 0, bottom: 8 }

export const COMPACT_CHART_AXIS_CLASS =
  '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground/70 [&_.recharts-cartesian-axis-tick_text]:text-[11px]'

export const SHARED_X_AXIS = {
  dataKey: 'axisLabel' as const,
  tickLine: false,
  axisLine: false,
  minTickGap: 24,
  interval: 'preserveStartEnd' as const,
}

type YAxisOptions = {
  tickFormatter?: (value: number) => string
}

export const sharedYAxis = (yMax: number, opts?: YAxisOptions) => ({
  tickLine: false,
  axisLine: false,
  width: 44,
  // A custom formatter (percent, duration) maps fractional values to readable
  // ticks, so don't force integer ticks — that would collapse a 0–1 ratio axis.
  allowDecimals: opts?.tickFormatter !== undefined,
  tickFormatter: opts?.tickFormatter ?? compactNumber,
  domain: [0, yMax] as [number, number],
})
