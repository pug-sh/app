import { memo, useLayoutEffect, useMemo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { useChartHover, useChartStable } from '@/components/charts/chart-context'
import { ComposedChart } from '@/components/charts/composed-chart'
import { Grid } from '@/components/charts/grid'
import { SeriesBar } from '@/components/charts/series-bar'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { edgeBucketHover, PAD_ROW_KEY, useChartMargin, useVendoredChartPrep } from './common'
import { ChartTooltip, DateLabelProvider, PILL_SCALING, XAxis } from './date-labels'
import type { ChartPoint } from './types'
import { YAxis } from './y-axis'

const HOUR_MS = 60 * 60 * 1000

// The bars and the axis read the shell's hover, so it has to hold the edge bucket too, before it paints.
function SnapPaddingHover() {
  const { tooltipData, setTooltipData } = useChartHover()
  const stable = useChartStable()

  useLayoutEffect(() => {
    const snapped = edgeBucketHover(tooltipData, stable)
    if (snapped !== tooltipData) setTooltipData(snapped)
  }, [tooltipData, setTooltipData, stable])

  return null
}

// Wraps the vendored chart (src/components/charts); never edit that directory.
// Series colors, tooltip rows and date labels are ours to inject; the chart
// supplies the rest.
export const BarChart = memo(function BarChart({
  data,
  seriesNames,
  seriesColors,
  granularity,
  timeZone,
  stacked = false,
  yTickFormatter,
  className = 'h-70 w-full',
}: {
  data: ChartPoint[]
  seriesNames: string[]
  seriesColors: SeriesColor[]
  granularity: Granularity
  timeZone: string
  stacked?: boolean
  yTickFormatter?: (value: number) => string
  className?: string
}) {
  const { chartData, tooltipRows, dateLabelFormatters } = useVendoredChartPrep(
    data,
    seriesNames,
    seriesColors,
    granularity,
    timeZone,
  )
  const formatValue = yTickFormatter ?? compactNumber
  const margin = useChartMargin(chartData, seriesNames.length, formatValue, { stacked })

  // The chart is a time-series one: its x-scale runs from the first bucket to the last
  // across the full plot width, so those two land on the plot edges, and SeriesBar
  // centres a bar on its x, putting half of each outside the plot. On the left that is
  // over the y-axis labels, on the right it is clipped by the SVG, and it is worst at
  // low bucket counts (~70px of a 640px plot at 5 buckets). A bucket-less row half a
  // bucket beyond each end moves bucket i to (i + 0.5)/n of the width (band-scale
  // placement), which clears both edges for every n: half a bar group is at most
  // 0.46 * innerWidth/(n + 1), and 0.5/n > 0.46/(n + 1) always.
  const paddedData = useMemo(() => {
    const first = chartData.at(0)?.date as Date | undefined
    const last = chartData.at(-1)?.date as Date | undefined
    if (!(first && last)) return chartData

    // Only the ratio of the two gaps reaches the scale, so a lone bucket lands centred
    // whatever this is, but it has to clear Date's 1ms resolution, or both pads round
    // onto the bucket itself and the domain collapses.
    const bucketMs = chartData.length > 1 ? (last.getTime() - first.getTime()) / (chartData.length - 1) : HOUR_MS
    return [
      { date: new Date(first.getTime() - bucketMs / 2), [PAD_ROW_KEY]: true },
      ...chartData,
      { date: new Date(last.getTime() + bucketMs / 2), [PAD_ROW_KEY]: true },
    ]
  }, [chartData])

  if (data.length === 0) return null

  // aspectRatio="auto" so height comes from className, matching the other charts.
  return (
    <DateLabelProvider value={dateLabelFormatters}>
      <ComposedChart
        aspectRatio="auto"
        barGap={stacked ? 0 : 6}
        className={cn(PILL_SCALING, className)}
        data={paddedData}
        margin={margin}
        stacked={stacked}
      >
        <Grid horizontal />
        <XAxis />
        <YAxis formatValue={formatValue} />
        {seriesNames.map((_, si) => (
          <SeriesBar key={si} dataKey={`series${si}`} fill={seriesColors[si]?.line} radius={stacked ? 0 : 3} />
        ))}
        <SnapPaddingHover />
        <ChartTooltip rows={tooltipRows} showCrosshair={false} />
      </ComposedChart>
    </DateLabelProvider>
  )
})
