import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { compactNumber } from '@/lib/format'
import type { SeriesColor } from '@/lib/event-colors'
import { useMemo } from 'react'
import { Cell, Legend, Pie, PieChart as RePieChart } from 'recharts'
import { type ChartPoint } from './types'

export const PieChart = ({
  data,
  seriesNames,
  seriesColors,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  seriesColors: SeriesColor[]
}) => {
  const chartData = useMemo(
    () =>
      seriesNames
        .map((name, si) => ({
          name,
          value: data.reduce((sum, point) => sum + (point.values[si] ?? 0), 0),
          fill: seriesColors[si]?.line ?? 'hsl(var(--chart-1))',
        }))
        .filter(item => item.value > 0),
    [data, seriesNames, seriesColors]
  )

  const total = useMemo(() => chartData.reduce((sum, row) => sum + row.value, 0), [chartData])

  const chartConfig = useMemo(
    () => Object.fromEntries(chartData.map((item, i) => [`series${i}`, { label: item.name, color: item.fill }])),
    [chartData]
  )

  if (chartData.length === 0) return null

  return (
    <ChartContainer
      config={chartConfig}
      className='h-70 w-full'
    >
      <RePieChart margin={{ top: 12, right: 8, left: 8, bottom: 8 }}>
        <ChartTooltip
          content={(
            <ChartTooltipContent
              hideLabel
              formatter={(value, name) => {
                const current = Number(value) || 0
                const ratio = total > 0 ? (current / total) * 100 : 0
                return (
                  <>
                    <span className='text-muted-foreground'>{name ?? ''}</span>
                    <span className='ml-auto font-mono tabular-nums text-foreground'>
                      {compactNumber(current)} ({ratio.toFixed(1)}%)
                    </span>
                  </>
                )
              }}
            />
          )}
        />
        <Pie
          data={chartData}
          dataKey='value'
          nameKey='name'
          cx='50%'
          cy='50%'
          outerRadius='82%'
          innerRadius='56%'
          stroke='none'
          isAnimationActive={false}
        >
          {chartData.map((entry, index) => (
            <Cell key={`${entry.name}-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <Legend
          verticalAlign='bottom'
          iconType='circle'
          formatter={(value, _entry, index) => {
            const item = chartData[index]
            if (!item) return value
            return `${value}: ${compactNumber(item.value)}`
          }}
        />
      </RePieChart>
    </ChartContainer>
  )
}
