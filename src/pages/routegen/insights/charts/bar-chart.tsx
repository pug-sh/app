import { memo, useMemo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { ComposedChart } from '@/components/charts/composed-chart'
import { Grid } from '@/components/charts/grid'
import { SeriesBar } from '@/components/charts/series-bar'
import { YAxis } from '@/components/charts/y-axis'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CHART_MARGIN, PAD_ROW_KEY, useVendoredChartPrep } from './common'
import { ChartTooltip, DateLabelProvider, PILL_SCALING, XAxis } from './date-labels'
import type { ChartPoint } from './types'

const HOUR_MS = 60 * 60 * 1000

// The axis snaps ticks to data rows and always spends one on the first row and one on the
// last — which are the padding rows, and blank. Asking for two extra keeps as many real
// bucket labels as the other charts get from the vendored default of 5.
const PADDED_NUM_TICKS = 7

// Wraps the vendored chart (src/components/charts) — never edit that directory.
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

  // The chart is a time-series one: its x-scale runs from the first bucket to the last
  // across the full plot width, so those two land on the plot edges — and SeriesBar
  // centres a bar on its x, putting half of each outside the plot. On the left that is
  // over the y-axis labels, on the right it is clipped by the SVG, and it is worst at
  // low bucket counts (~70px of a 640px plot at 5 buckets). A bucket-less row half a
  // bucket beyond each end moves bucket i to (i + 0.5)/n of the width — band-scale
  // placement — which clears both edges for every n: a bar group is at most
  // 0.46 * innerWidth/(n + 1) wide, and 0.5/n > 0.46/(n + 1) always.
  const paddedData = useMemo(() => {
    const first = chartData.at(0)?.date as Date | undefined
    const last = chartData.at(-1)?.date as Date | undefined
    if (!(first && last)) return chartData

    // Only the ratio of the two gaps reaches the scale, so a lone bucket lands centred
    // whatever this is — but it has to clear Date's 1ms resolution, or both pads round
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
  // margin.top trims the vendored 40px default — nothing renders in it, and it cost
  // ~15% of the plot height on top of the y-domain's own headroom.
  return (
    <DateLabelProvider value={dateLabelFormatters}>
      <ComposedChart
        aspectRatio="auto"
        barGap={stacked ? 0 : 6}
        className={cn(PILL_SCALING, className)}
        data={paddedData}
        margin={CHART_MARGIN}
        stacked={stacked}
      >
        <Grid horizontal />
        <XAxis numTicks={PADDED_NUM_TICKS} />
        <YAxis formatValue={yTickFormatter ?? compactNumber} />
        {seriesNames.map((_, si) => (
          <SeriesBar key={si} dataKey={`series${si}`} fill={seriesColors[si]?.line} radius={stacked ? 0 : 3} />
        ))}
        <ChartTooltip rows={tooltipRows} />
      </ComposedChart>
    </DateLabelProvider>
  )
})
