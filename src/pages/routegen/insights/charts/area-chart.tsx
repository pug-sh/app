import { memo, useCallback, useMemo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { Area } from '@/components/charts/area'
import { AreaChart as VendoredAreaChart } from '@/components/charts/area-chart'
import { Grid } from '@/components/charts/grid'
import { ChartTooltip } from '@/components/charts/tooltip'
import { XAxis } from '@/components/charts/x-axis'
import type { SeriesColor } from '@/lib/event-colors'
import { formatAxisDate } from './helpers'
import type { ChartPoint } from './types'
import { YAxis } from './y-axis'

// Wraps the vendored chart (src/components/charts) — never edit that directory
// except for the documented patches. The y axis, series colors, tooltip rows and
// date labels are all ours to inject; the chart supplies the rest.
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
  const chartData = useMemo(
    () =>
      data.map(point => {
        const row: Record<string, unknown> = { date: point.date }
        seriesNames.forEach((_, si) => {
          row[`series${si}`] = point.values[si] ?? 0
        })
        return row
      }),
    [data, seriesNames],
  )

  // Without this the tooltip falls back to the raw dataKey ("series0") — the
  // vendored chart has no equivalent of recharts' chartConfig label map.
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
  // server-computed bucket boundaries, and vary by granularity.
  const formatDateLabel = useCallback(
    (date: Date) => formatAxisDate(date, granularity, timeZone),
    [granularity, timeZone],
  )

  if (data.length === 0) return null

  // aspectRatio="auto" so height comes from className, matching the other charts.
  return (
    <VendoredAreaChart aspectRatio="auto" className={className} data={chartData} formatDateLabel={formatDateLabel}>
      <Grid horizontal />
      <XAxis />
      <YAxis formatter={yTickFormatter} />
      {seriesNames.map((_, si) => (
        <Area key={si} dataKey={`series${si}`} fill={seriesColors[si]?.line} stroke={seriesColors[si]?.line} />
      ))}
      <ChartTooltip rows={tooltipRows} />
    </VendoredAreaChart>
  )
})
