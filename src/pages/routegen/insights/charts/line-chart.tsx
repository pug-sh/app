import { memo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { Grid } from '@/components/charts/grid'
import { Line } from '@/components/charts/line'
import { LineChart as VendoredLineChart } from '@/components/charts/line-chart'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CHART_MARGIN, type ChartComparison, COMPARE_KEY, SERIES_CURVE, useVendoredChartPrep } from './common'
import { CompareLine } from './compare-series'
import { ChartTooltip, DateLabelProvider, PILL_SCALING, XAxis } from './date-labels'
import type { ChartPoint } from './types'
import { YAxis } from './y-axis'

// Wraps the vendored chart (src/components/charts); never edit that directory.
// Series colors, tooltip rows and date labels are ours to inject; the chart
// supplies the rest.
export const LineChart = memo(function LineChart({
  data,
  seriesNames,
  seriesColors,
  granularity,
  yTickFormatter,
  timeZone,
  comparison,
  className = 'h-70 w-full',
}: {
  data: ChartPoint[]
  seriesNames: string[]
  seriesColors: SeriesColor[]
  granularity: Granularity
  yTickFormatter?: (value: number) => string
  timeZone: string
  comparison?: ChartComparison
  className?: string
}) {
  const { chartData, tooltipRows, dateLabelFormatters } = useVendoredChartPrep(
    data,
    seriesNames,
    seriesColors,
    granularity,
    timeZone,
    comparison,
  )

  if (data.length === 0) return null

  // aspectRatio="auto" so height comes from className, matching the other charts.
  return (
    <DateLabelProvider value={dateLabelFormatters}>
      <VendoredLineChart
        aspectRatio="auto"
        className={cn(PILL_SCALING, className)}
        data={chartData}
        margin={CHART_MARGIN}
      >
        <Grid horizontal />
        <XAxis />
        <YAxis formatValue={yTickFormatter ?? compactNumber} />
        {/* Line defaults fadeEdges on (Area defaults it off): a faded first/last
            bucket reads as uncertain data when those are real values. */}
        {seriesNames.map((_, si) => (
          <Line
            key={si}
            curve={SERIES_CURVE}
            dataKey={`series${si}`}
            fadeEdges={false}
            stroke={seriesColors[si]?.line}
          />
        ))}
        {/* Last, to match the row order in the prep. compare-series.tsx says why not a bare Line. */}
        {comparison ? <CompareLine dataKey={COMPARE_KEY} stroke={comparison.color.line} /> : null}
        <ChartTooltip rows={tooltipRows} />
      </VendoredLineChart>
    </DateLabelProvider>
  )
})
