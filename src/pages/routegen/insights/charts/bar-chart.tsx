import { Bar, CartesianGrid, BarChart as ReBarChart, XAxis, YAxis } from 'recharts'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { SeriesColor } from '@/lib/event-colors'
import { formatTooltipLabel, SHARED_MARGIN, SHARED_X_AXIS, sharedYAxis, useChartPrep } from './common'
import type { ChartPoint } from './types'

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
  const { chartConfig, chartData, yMax } = useChartPrep(data, seriesNames, seriesColors, granularity, stacked)

  if (data.length === 0) return null

  return (
    <ChartContainer config={chartConfig} className="h-70 w-full">
      <ReBarChart
        key={stacked ? 'stacked' : 'grouped'}
        data={chartData}
        margin={SHARED_MARGIN}
        barGap={stacked ? 0 : 6}
        barCategoryGap={stacked ? '24%' : '18%'}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis {...SHARED_X_AXIS} />
        <YAxis {...sharedYAxis(yMax)} />
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
