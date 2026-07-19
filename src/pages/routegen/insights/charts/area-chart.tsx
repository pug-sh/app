import { memo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { Area } from '@/components/charts/area'
import { AreaChart as VendoredAreaChart } from '@/components/charts/area-chart'
import { Grid } from '@/components/charts/grid'
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
export const AreaChart = memo(function AreaChart({
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
  return (
    <VendoredAreaChart aspectRatio="auto" className={className} data={chartData} formatDateLabel={formatDateLabel}>
      <Grid horizontal />
      <XAxis />
      <YAxis formatValue={yTickFormatter ?? compactNumber} />
      {seriesNames.map((_, si) => (
        <Area key={si} dataKey={`series${si}`} fill={seriesColors[si]?.line} stroke={seriesColors[si]?.line} />
      ))}
      <ChartTooltip rows={tooltipRows} />
    </VendoredAreaChart>
  )
})
