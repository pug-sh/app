import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { SeriesColor } from '@/lib/event-colors'
import { CartesianGrid, Line, LineChart as ReLineChart, XAxis, YAxis } from 'recharts'
import { useChartPrep, formatTooltipLabel, SHARED_MARGIN, SHARED_X_AXIS, sharedYAxis } from './common'
import { type ChartPoint } from './types'

export const LineChart = ({
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
  const { chartConfig, chartData, yMax } = useChartPrep(data, seriesNames, seriesColors, granularity)

  if (data.length === 0) return null

  return (
    <ChartContainer config={chartConfig} className="h-70 w-full">
      <ReLineChart data={chartData} margin={SHARED_MARGIN}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis {...SHARED_X_AXIS} />
        <YAxis {...sharedYAxis(yMax)} />
        <ChartTooltip
          cursor={{ stroke: 'currentColor', strokeOpacity: 0.15, strokeDasharray: '3 3' }}
          content={<ChartTooltipContent labelFormatter={formatTooltipLabel} />}
        />
        {seriesNames.map((_, si) => (
          <Line
            key={si}
            type="monotone"
            dataKey={`series${si}`}
            stroke={seriesColors[si]?.line}
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
          />
        ))}
      </ReLineChart>
    </ChartContainer>
  )
}
