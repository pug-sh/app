import { memo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { Area } from '@/components/charts/area'
import { AreaChart as VendoredAreaChart } from '@/components/charts/area-chart'
import { Grid } from '@/components/charts/grid'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type ChartComparison, COMPARE_KEY, SERIES_CURVE, useChartMargin, useVendoredChartPrep } from './common'
import { CompareArea } from './compare-series'
import { ChartTooltip, DateLabelProvider, PILL_SCALING, XAxis } from './date-labels'
import type { ChartPoint } from './types'
import { YAxis } from './y-axis'

// Wraps the vendored chart (src/components/charts); never edit that directory.
// Series colors, tooltip rows and date labels are ours to inject; the chart
// supplies the rest.
export const AreaChart = memo(function AreaChart({
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
  const formatValue = yTickFormatter ?? compactNumber
  const margin = useChartMargin(chartData, seriesNames.length, formatValue, { compare: !!comparison })

  if (data.length === 0) return null

  // aspectRatio="auto" so height comes from className, matching the other charts.
  return (
    <DateLabelProvider value={dateLabelFormatters}>
      <VendoredAreaChart aspectRatio="auto" className={cn(PILL_SCALING, className)} data={chartData} margin={margin}>
        <Grid horizontal />
        <XAxis />
        <YAxis formatValue={formatValue} />
        {seriesNames.map((_, si) => (
          <Area
            key={si}
            curve={SERIES_CURVE}
            dataKey={`series${si}`}
            fill={seriesColors[si]?.line}
            stroke={seriesColors[si]?.line}
          />
        ))}
        {/* Last, to match the row order in the prep. compare-series.tsx says why not a bare Area. */}
        {comparison ? <CompareArea dataKey={COMPARE_KEY} stroke={comparison.color.line} /> : null}
        <ChartTooltip rows={tooltipRows} />
      </VendoredAreaChart>
    </DateLabelProvider>
  )
})
