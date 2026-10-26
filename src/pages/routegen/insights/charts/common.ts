import { curveMonotoneX } from '@visx/curve'
import { useCallback, useMemo } from 'react'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ChartStableContextValue, TooltipData } from '@/components/charts/chart-context'
import type { SeriesColor } from '@/lib/event-colors'
import { formatAxisDate, formatTooltipDate, formatTooltipTitle, spansMultipleDays } from './helpers'
import type { ChartPoint } from './types'

// Line defaults to curveNatural, which overshoots, and the y-domain pads the top but pins
// the floor at 0, so a series touching 0 gets drawn below the axis. Monotone can't overshoot.
export const SERIES_CURVE = curveMonotoneX

// The vendored y axis pins its labels 8px off the plot; our YAxis wrapper widens that by this much, so the
// gap matches the band right of the plot: CHART_MARGIN.right plus a tile's 17px of padding and border.
export const Y_AXIS_GAP = 22

// Top: 8px is the floor, room for the top tick label's upper half. Left: the y labels' 40px column plus
// Y_AXIS_GAP. Right: just clears the hover dot's 13px halo; the end date label and the pill are kept inside.
export const CHART_MARGIN = { top: 8, left: 40 + Y_AXIS_GAP, right: 13 }

// Marks a row added only to pad the x-domain (see the bar wrapper). Padding rows carry
// a date and nothing else, so they draw no bar, but they are still real rows to the
// axis, which would label them, so the date-label override blanks them by this key.
export const PAD_ROW_KEY = '__pad'

// Hover snaps to the nearest row, so the strip beyond each edge bar hovers a padding row, a bucket of zeros
// that isn't in the data. This hands it to the edge bucket the strip belongs to.
export const edgeBucketHover = (
  tooltipData: TooltipData | null,
  { data, lines, xAccessor, xScale, yScale }: ChartStableContextValue,
) => {
  if (!tooltipData?.point[PAD_ROW_KEY]) return tooltipData
  const index = tooltipData.index === 0 ? 1 : data.length - 2
  const point = data[index]
  const yPositions: Record<string, number> = {}
  for (const { dataKey } of lines) {
    const value = point[dataKey]
    if (typeof value === 'number') yPositions[dataKey] = yScale(value)
  }
  return { point, index, x: xScale(xAccessor(point)), yPositions }
}

// Prefixed like PAD_ROW_KEY so it can't collide with a `series${i}` index.
export const COMPARE_KEY = '__compare'
const PENDING_KEY = '__pending'

// The compare-vs-prior window. `values` is already laid over this window's buckets by the caller
// (alignComparisonValues), one per row of `data`.
export type ChartComparison = { label: string; values: number[]; color: SeriesColor }

// Prep shared by the vendored-chart wrappers (area, line, bar). `date` stays a
// real Date: the wrappers inject the formatted labels via the context override.
export const useVendoredChartPrep = (
  data: ChartPoint[],
  seriesNames: string[],
  seriesColors: SeriesColor[],
  granularity: Granularity,
  timeZone: string,
  comparison?: ChartComparison,
) => {
  const chartData = useMemo(() => {
    let warned = false
    return data.map((point, index) => {
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
      if (comparison) row[COMPARE_KEY] = comparison.values[index] ?? 0
      if (point.pending) row[PENDING_KEY] = true
      return row
    })
  }, [data, seriesNames, comparison])

  // Without this the tooltip prints the raw dataKey ("series0"): the vendored
  // chart has no equivalent of recharts' chartConfig label map.
  //
  // Comparison row last: the tooltip colors its hover dots from these rows by position, and its own
  // order is child order.
  const tooltipRows = useCallback(
    (point: Record<string, unknown>) => {
      const value = (v: unknown) => (point[PENDING_KEY] ? '—' : Number(v ?? 0).toLocaleString())
      const rows = seriesNames.map((name, si) => ({
        color: seriesColors[si]?.line ?? '',
        label: name,
        value: value(point[`series${si}`]),
      }))
      if (comparison) {
        rows.push({ color: comparison.color.line, label: comparison.label, value: value(point[COMPARE_KEY]) })
      }
      return rows
    },
    [seriesNames, seriesColors, comparison],
  )

  // Bucket labels must render in the project's reporting zone to match the
  // server-computed bucket boundaries, and vary by granularity. The axis and the
  // hover pill want different detail: the axis stays terse to fit, while the pill
  // has to say which day an hour bucket lands on (an hourly range spans up to 14).
  const axisNeedsDay = useMemo(
    () =>
      granularity === Granularity.HOUR &&
      spansMultipleDays(
        data.map(p => p.date),
        timeZone,
      ),
    [data, granularity, timeZone],
  )

  const dateLabelFormatters = useMemo(
    () => ({
      axis: (date: Date) => formatAxisDate(date, granularity, timeZone, axisNeedsDay),
      tooltip: (date: Date) => formatTooltipDate(date, granularity, timeZone),
      title: (date: Date) => formatTooltipTitle(date, timeZone),
    }),
    [granularity, timeZone, axisNeedsDay],
  )

  return { chartData, tooltipRows, dateLabelFormatters }
}
