import { useCallback, useMemo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { formatAxisDate, formatTooltipDate } from './helpers'
import type { ChartPoint } from './types'

// The vendored charts default to a 40px margin on every side. Nothing draws in the
// top one (the loading label is inset-0 centered), so it was pure dead space stacked
// on top of the y-domain's own ~10% headroom. 8px is the floor, not taste: the topmost
// tick label sits half above its gridline and nothing clips it. Sides keep the default —
// they hold the axis labels. Partial: the chart merges it over DEFAULT_MARGIN.
export const CHART_MARGIN = { top: 8 }

// Marks a row added only to pad the x-domain (see the bar wrapper). Padding rows carry
// a date and nothing else, so they draw no bar — but they are still real rows to the
// axis, which would label them, so the date-label override blanks them by this key.
export const PAD_ROW_KEY = '__pad'

// Prep shared by the vendored-chart wrappers (area, line, bar). `date` stays a
// real Date — the wrappers inject the formatted labels via the context override.
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
  // server-computed bucket boundaries, and vary by granularity. The axis and the
  // hover pill want different detail: the axis stays terse to fit, while the pill
  // has to say which day an hour bucket lands on (an hourly range spans up to 14).
  const dateLabelFormatters = useMemo(
    () => ({
      axis: (date: Date) => formatAxisDate(date, granularity, timeZone),
      tooltip: (date: Date) => formatTooltipDate(date, granularity, timeZone),
    }),
    [granularity, timeZone],
  )

  return { chartData, tooltipRows, dateLabelFormatters }
}
