import { memo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { ComposedChart } from '@/components/charts/composed-chart'
import { Grid } from '@/components/charts/grid'
import { SeriesBar } from '@/components/charts/series-bar'
import { ChartTooltip } from '@/components/charts/tooltip'
import { XAxis } from '@/components/charts/x-axis'
import { YAxis } from '@/components/charts/y-axis'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { useVendoredChartPrep } from './common'
import type { ChartPoint } from './types'

// Wraps the vendored chart (src/components/charts) — never edit that directory
// except for the documented patches. Series colors, tooltip rows and date labels
// are ours to inject; the chart supplies the rest.
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
  const { chartData, tooltipRows, formatDateLabel } = useVendoredChartPrep(
    data,
    seriesNames,
    seriesColors,
    granularity,
    timeZone,
  )

  if (data.length === 0) return null

  // aspectRatio="auto" so height comes from className, matching the other charts.
  return (
    <ComposedChart
      aspectRatio="auto"
      barGap={stacked ? 0 : 6}
      className={className}
      data={chartData}
      formatDateLabel={formatDateLabel}
      stacked={stacked}
    >
      <Grid horizontal />
      <XAxis />
      <YAxis formatValue={yTickFormatter ?? compactNumber} />
      {seriesNames.map((_, si) => (
        <SeriesBar key={si} dataKey={`series${si}`} fill={seriesColors[si]?.line} radius={stacked ? 0 : 3} />
      ))}
      <ChartTooltip rows={tooltipRows} />
    </ComposedChart>
  )
})
