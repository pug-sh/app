import { scaleLinear } from 'd3-scale'
import { curveMonotoneX } from 'd3-shape'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ChartStableContextValue, TooltipData } from '@/components/charts/chart-context'
import { DEFAULT_Y_DOMAIN_TWEEN_MS } from '@/components/charts/chart-phase'
import { Y_AXIS_DEFAULT_TICK_COUNT } from '@/components/charts/y-axis-ticks'
import { niceYDomain, resolveTimeSeriesYDomain } from '@/components/charts/y-domain-utils'
import type { SeriesColor } from '@/lib/event-colors'
import { formatAxisDate, formatTooltipDate, formatTooltipTitle, spansMultipleDays, yAxisLabelWidth } from './helpers'
import type { ChartPoint } from './types'

// Line defaults to curveNatural, which overshoots, and the y-domain pads the top but pins
// the floor at 0, so a series touching 0 gets drawn below the axis. Monotone can't overshoot.
export const SERIES_CURVE = curveMonotoneX

// The vendored y axis pins its labels 8px off the plot; our YAxis wrapper widens that by this much, so the
// gap matches the band right of the plot: CHART_MARGIN.right plus a tile's 17px of padding and border.
export const Y_AXIS_GAP = 22
const Y_LABEL_PAD = 8

// Top: 8px is the floor, room for the top tick label's upper half. Right: just clears the hover dot's 13px halo;
// the end date label and the pill are kept inside. Left is sized to the y labels by useChartMargin.
export const CHART_MARGIN = { top: 8, right: 13 }

// A fixed y label column indents a short axis ("8") and clips a long one ("100,000"), so this reruns the shell's
// target domain and the axis's ticks to fit the widest label.
export const useChartMargin = (
  rows: Record<string, unknown>[],
  seriesCount: number,
  formatValue: (value: number) => string,
  { compare = false, stacked = false } = {},
) => {
  const left = useMemo(() => {
    const keys = Array.from({ length: seriesCount }, (_, si) => `series${si}`)
    if (compare) keys.push(COMPARE_KEY)
    const rowSum = (row: Record<string, unknown>) =>
      keys.reduce((sum, key) => {
        const value = row[key]
        return sum + (typeof value === 'number' ? value : 0)
      }, 0)
    const stackedMax = stacked ? Math.max(...rows.map(rowSum)) : undefined
    const domain = niceYDomain(resolveTimeSeriesYDomain(rows, keys, stackedMax))
    const ticks = scaleLinear().domain(domain).ticks(Y_AXIS_DEFAULT_TICK_COUNT)
    const widest = Math.max(0, ...ticks.map(tick => yAxisLabelWidth(formatValue(tick))))
    // The table is for 12px, but text-xs is rem, so the browser's font size setting scales the labels.
    const rootScale = (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16
    return Math.ceil(widest * rootScale) + Y_LABEL_PAD + Y_AXIS_GAP
  }, [rows, seriesCount, formatValue, compare, stacked])

  // The axis fades its old labels out as a new domain lands, so a column that narrows at once would clip them.
  const [held, setHeld] = useState(left)
  useEffect(() => {
    if (left >= held) {
      setHeld(left)
      return
    }
    const id = setTimeout(() => setHeld(left), DEFAULT_Y_DOMAIN_TWEEN_MS)
    return () => clearTimeout(id)
  }, [left, held])

  return { ...CHART_MARGIN, left: Math.max(left, held) }
}

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
