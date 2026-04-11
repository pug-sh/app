import { compactNumber } from '@/lib/format'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { useMemo } from 'react'
import { Bar, BarChart as ReBarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import type { SeriesColor } from '@/lib/event-colors'

export interface FunnelSeriesData {
  label: string
  steps: Array<{ name: string; count: number }>
  color: string
}

export const FunnelBreakdownTable = ({ series }: { series: FunnelSeriesData[] }) => {
  if (series.length === 0) return null
  const stepNames = series[0].steps.map(s => s.name)

  return (
    <div className='mt-4 border border-border rounded-lg overflow-auto'>
      <table className='w-full'>
        <thead>
          <tr className='border-b border-border bg-muted/20'>
            <th className='py-2 px-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
              Breakdown
            </th>
            {stepNames.map(name => (
              <th key={name} className='py-2 px-3 text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
                {name}
              </th>
            ))}
            <th className='py-2 px-3 text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
              Conversion
            </th>
          </tr>
        </thead>
        <tbody>
          {series.map(row => {
            const first = row.steps[0]?.count ?? 0
            const last = row.steps[row.steps.length - 1]?.count ?? 0
            const overall = first > 0 ? (last / first) * 100 : 0
            return (
              <tr key={row.label} className='border-b border-border/50 transition-colors hover:bg-muted/40'>
                <td className='py-2 px-3 text-xs'>
                  <div className='flex items-center gap-1.5'>
                    <span className='w-2 h-2 rounded-full shrink-0' style={{ background: row.color }} />
                    {row.label}
                  </div>
                </td>
                {row.steps.map((step, si) => {
                  const rate = first > 0 ? (step.count / first) * 100 : 0
                  return (
                    <td key={step.name} className='py-2 px-3 text-right text-xs tabular-nums'>
                      <span>{compactNumber(step.count)}</span>
                      {si > 0 && (
                        <span className='text-muted-foreground ml-1'>{rate.toFixed(0)}%</span>
                      )}
                    </td>
                  )
                })}
                <td className='py-2 px-3 text-right text-xs tabular-nums font-medium'>
                  {overall.toFixed(1)}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export interface FunnelStep {
  name: string
  count: number
}

export const FunnelChart = ({ steps, seriesColors }: { steps: FunnelStep[]; seriesColors: SeriesColor[] }) => {
  const chartConfig = useMemo(() => ({
    conversion: { label: 'Conversion %', color: 'hsl(var(--chart-1))' },
  } satisfies ChartConfig), [])

  const firstStepCount = Math.max(steps[0]?.count ?? 0, 0)
  const chartData = steps.map((step, index) => {
    const currentCount = Math.max(step.count, 0)
    const prevCount = Math.max(steps[index - 1]?.count ?? currentCount, 0)
    const fromStart = firstStepCount > 0 ? (currentCount / firstStepCount) * 100 : 0
    let fromPrev = 100
    let dropOff = 0
    if (index > 0) {
      fromPrev = prevCount > 0 ? (currentCount / prevCount) * 100 : 0
      dropOff = Math.max(prevCount - currentCount, 0)
    }

    return {
      event: step.name || `Step ${index + 1}`,
      count: currentCount,
      conversion: Number(fromStart.toFixed(2)),
      fromPrev: Number(fromPrev.toFixed(2)),
      dropOff,
    }
  })

  if (steps.length === 0) return null

  return (
    <div className='mt-4 rounded-lg border border-border/60 p-4'>
      <ChartContainer config={chartConfig} className='h-72 w-full'>
        <ReBarChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray='3 3' />
          <XAxis dataKey='event' tickLine={false} axisLine={false} interval={0} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            domain={[0, 100]}
            tickFormatter={(value: number) => `${value}%`}
          />
          <ChartTooltip
            cursor={{ fill: 'transparent' }}
            content={(
              <ChartTooltipContent
                labelFormatter={label => String(label ?? '')}
                formatter={(_, __, item) => {
                  const row = (item.payload ?? {}) as {
                    count?: number
                    conversion?: number
                    fromPrev?: number
                    dropOff?: number
                  }
                  return (
                    <div className='w-full space-y-0.5'>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-muted-foreground'>Completed</span>
                        <span className='font-mono tabular-nums'>{compactNumber(row.count ?? 0)}</span>
                      </div>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-muted-foreground'>From start</span>
                        <span className='font-mono tabular-nums'>{(row.conversion ?? 0).toFixed(1)}%</span>
                      </div>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-muted-foreground'>From previous</span>
                        <span className='font-mono tabular-nums'>{(row.fromPrev ?? 0).toFixed(1)}%</span>
                      </div>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-muted-foreground'>Drop-off</span>
                        <span className='font-mono tabular-nums'>{compactNumber(row.dropOff ?? 0)}</span>
                      </div>
                    </div>
                  )
                }}
              />
            )}
          />
          <Bar dataKey='conversion' fill='var(--color-conversion)' radius={[6, 6, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={seriesColors[index]?.line} />
            ))}
          </Bar>
        </ReBarChart>
      </ChartContainer>
    </div>
  )
}
