import { memo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { Grid } from '@/components/charts/grid'
import { Line } from '@/components/charts/line'
import { LineChart as VendoredLineChart } from '@/components/charts/line-chart'
import { YAxis } from '@/components/charts/y-axis'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { CHART_MARGIN, useVendoredChartPrep } from './common'
import { ChartTooltip, DateLabelProvider, XAxis } from './date-labels'
import type { ChartPoint } from './types'

// Wraps the vendored chart (src/components/charts) — never edit that directory
// except for the documented patches. Series colors, tooltip rows and date labels
// are ours to inject; the chart supplies the rest.
export const LineChart = memo(function LineChart({
  data,
  seriesNames,
  seriesColors,
  granularity,
  yTickFormatter,
  timeZone,
  className = 'h-70 w-full',
}: {
  data: ChartPoint[]
  seriesNames: string[]
  seriesColors: SeriesColor[]
  granularity: Granularity
  yTickFormatter?: (value: number) => string
  timeZone: string
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
  // margin.top trims the vendored 40px default — nothing renders in it, and it cost
  // ~15% of the plot height on top of the y-domain's own headroom.
  return (
    <DateLabelProvider value={formatDateLabel}>
      <VendoredLineChart aspectRatio="auto" className={className} data={chartData} margin={CHART_MARGIN}>
        <Grid horizontal />
        <XAxis />
        <YAxis formatValue={yTickFormatter ?? compactNumber} />
        {/* Line defaults fadeEdges on (Area defaults it off) — a faded first/last
            bucket reads as uncertain data when those are real values. */}
        {seriesNames.map((_, si) => (
          <Line key={si} dataKey={`series${si}`} fadeEdges={false} stroke={seriesColors[si]?.line} />
        ))}
        <ChartTooltip rows={tooltipRows} />
      </VendoredLineChart>
    </DateLabelProvider>
  )
})
