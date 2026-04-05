import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { compactNumber } from '@/lib/format'
import { useMemo } from 'react'
import { Area, CartesianGrid, AreaChart as ReAreaChart, XAxis, YAxis } from 'recharts'
import type { SeriesColor } from '@/lib/event-colors'
import { buildChartConfig, buildChartData, formatTooltipLabel } from './common'
import { niceMax } from './helpers'
import { type ChartPoint } from './types'

export const AreaChart = ({
  data,
  seriesNames,
  seriesColors,
  granularity,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  seriesColors: SeriesColor[]
  granularity: Granularity
}) => {
  const chartConfig = useMemo(() => buildChartConfig(seriesNames, seriesColors), [seriesNames, seriesColors])
  const chartData = useMemo(() => buildChartData(data, seriesNames, granularity), [data, seriesNames, granularity])
  const yMax = useMemo(() => {
    const allVals = data.flatMap(d => d.values)
    return niceMax(Math.max(...allVals, 0))
  }, [data])

  if (data.length === 0) return null

  return (
    <ChartContainer config={chartConfig} className='h-70 w-full'>
      <ReAreaChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray='3 3' />
        <XAxis
          dataKey='axisLabel'
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          interval='preserveStartEnd'
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          domain={[0, yMax]}
          allowDecimals={false}
          tickFormatter={compactNumber}
        />
        <ChartTooltip
          cursor={{ stroke: 'currentColor', strokeOpacity: 0.15, strokeDasharray: '3 3' }}
          content={<ChartTooltipContent labelFormatter={formatTooltipLabel} />}
        />
        {seriesNames.map((_, si) => (
          <Area
            key={si}
            type='monotone'
            dataKey={`series${si}`}
            stroke={seriesColors[si]?.line}
            fill={seriesColors[si]?.line}
            fillOpacity={0.22}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
      </ReAreaChart>
    </ChartContainer>
  )
}
