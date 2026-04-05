import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { compactNumber } from '@/lib/format'
import { useMemo } from 'react'
import { Bar, CartesianGrid, BarChart as ReBarChart, XAxis, YAxis } from 'recharts'
import type { SeriesColor } from '@/lib/event-colors'
import { buildChartConfig, buildChartData, formatTooltipLabel } from './common'
import { computeYMax } from './helpers'
import { type ChartPoint } from './types'

export const BarChart = ({
  data,
  seriesNames,
  seriesColors,
  granularity,
  stacked,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  seriesColors: SeriesColor[]
  granularity: Granularity
  stacked: boolean
}) => {
  const chartConfig = useMemo(() => buildChartConfig(seriesNames, seriesColors), [seriesNames, seriesColors])
  const chartData = useMemo(() => buildChartData(data, seriesNames, granularity), [data, seriesNames, granularity])
  const yMax = useMemo(() => computeYMax(data, stacked), [data, stacked])

  if (data.length === 0) return null

  return (
    <ChartContainer config={chartConfig} className='h-70 w-full'>
      <ReBarChart
        key={stacked ? 'stacked' : 'grouped'}
        data={chartData}
        margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
        barGap={stacked ? 0 : 6}
        barCategoryGap={stacked ? '24%' : '18%'}
      >
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
          cursor={{ fill: 'transparent' }}
          content={<ChartTooltipContent labelFormatter={formatTooltipLabel} />}
        />
        {seriesNames.map((_, si) => (
          <Bar
            key={si}
            dataKey={`series${si}`}
            fill={seriesColors[si]?.line}
            stroke={seriesColors[si]?.line}
            strokeWidth={1}
            isAnimationActive={false}
            stackId={stacked ? 'stack' : `group-${si}`}
            radius={stacked ? 0 : [3, 3, 0, 0]}
          />
        ))}
      </ReBarChart>
    </ChartContainer>
  )
}
