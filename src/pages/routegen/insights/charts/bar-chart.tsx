import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { compactNumber } from '@/lib/format'
import { useMemo } from 'react'
import { Bar, CartesianGrid, BarChart as ReBarChart, XAxis, YAxis } from 'recharts'
import { SERIES_COLORS } from '../chart-colors'
import { buildChartConfig, buildChartData, formatTooltipLabel } from './common'
import { niceMax } from './helpers'
import { type ChartPoint } from './types'

export const BarChart = ({
  data,
  seriesNames,
  granularity,
  stacked,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  granularity: Granularity
  stacked: boolean
}) => {
  const chartConfig = useMemo(() => buildChartConfig(seriesNames), [seriesNames])
  const chartData = useMemo(() => buildChartData(data, seriesNames, granularity), [data, seriesNames, granularity])
  const yMax = useMemo(() => {
    const allVals = stacked
      ? data.map(d => d.values.reduce((a, b) => a + b, 0))
      : data.flatMap(d => d.values)
    return niceMax(Math.max(...allVals, 0))
  }, [data, stacked])

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
            fill={SERIES_COLORS[si % SERIES_COLORS.length].line}
            stroke={SERIES_COLORS[si % SERIES_COLORS.length].line}
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
