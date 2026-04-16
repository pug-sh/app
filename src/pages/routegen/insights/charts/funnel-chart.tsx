import { compactNumber } from '@/lib/format'
import { getSeriesColor } from '@/lib/event-colors'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart as ReBarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { Check } from 'lucide-react'

export interface FunnelSeriesData {
  label: string
  steps: Array<{ name: string; count: number }>
  color: string
}

export interface FunnelStep {
  name: string
  count: number
}

// ── Chart (single or grouped bars) ──────────────────────────────────────────

type ChartRow = Record<string, number | string>

export const FunnelChart = ({ series }: { series: FunnelSeriesData[] }) => {
  const isMultiSeries = series.length > 1
  const stepNames = useMemo(() => series[0]?.steps.map(s => s.name) ?? [], [series])

  const chartData = useMemo<ChartRow[]>(
    () =>
      stepNames.map((stepName, stepIdx) => {
        const row: ChartRow = { step: stepName }
        series.forEach(s => {
          const firstCount = Math.max(s.steps[0]?.count ?? 0, 0)
          const stepCount = Math.max(s.steps[stepIdx]?.count ?? 0, 0)
          const prevCount = Math.max(s.steps[stepIdx - 1]?.count ?? stepCount, 0)
          row[s.label] = firstCount > 0 ? Number(((stepCount / firstCount) * 100).toFixed(2)) : 0
          row[`${s.label}__count`] = stepCount
          row[`${s.label}__fromPrev`] =
            stepIdx > 0 && prevCount > 0 ? Number(((stepCount / prevCount) * 100).toFixed(2)) : 100
          row[`${s.label}__dropOff`] = Math.max(prevCount - stepCount, 0)
        })
        return row
      }),
    [series, stepNames]
  )

  const chartConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(series.map(s => [s.label, { label: s.label, color: s.color }])),
    [series]
  )

  if (series.length === 0 || stepNames.length === 0) return null

  return (
    <div className='rounded-lg border border-border/60 p-4'>
      <ChartContainer config={chartConfig} className='h-64 w-full'>
        <ReBarChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 8 }} barCategoryGap='20%' barGap={2}>
          <CartesianGrid vertical={false} strokeDasharray='3 3' />
          <XAxis dataKey='step' tickLine={false} axisLine={false} interval={0} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <ChartTooltip
            cursor={{ fill: 'transparent' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0]?.payload as ChartRow
              const step = row.step as string
              return (
                <div className='rounded-lg border border-border bg-popover p-2.5 shadow-sm text-xs min-w-[160px]'>
                  <p className='font-medium text-foreground mb-1.5'>{step}</p>
                  {series.map(s => {
                    const count = (row[`${s.label}__count`] as number) ?? 0
                    const conv = (row[s.label] as number) ?? 0
                    const fromPrev = (row[`${s.label}__fromPrev`] as number) ?? 100
                    const dropOff = (row[`${s.label}__dropOff`] as number) ?? 0
                    return (
                      <div key={s.label} className='py-1 border-t border-border/50 first:border-0 first:pt-0'>
                        {isMultiSeries && (
                          <div className='flex items-center gap-1.5 mb-1'>
                            <span className='w-2 h-2 rounded-full shrink-0' style={{ background: s.color }} />
                            <span className='font-medium text-foreground'>{s.label}</span>
                          </div>
                        )}
                        <div className='space-y-0.5 pl-3.5'>
                          <div className='flex items-center justify-between gap-4'>
                            <span className='text-muted-foreground'>Completed</span>
                            <span className='font-mono tabular-nums'>{compactNumber(count)}</span>
                          </div>
                          <div className='flex items-center justify-between gap-4'>
                            <span className='text-muted-foreground'>From start</span>
                            <span className='font-mono tabular-nums'>{conv.toFixed(1)}%</span>
                          </div>
                          {!isMultiSeries && (
                            <>
                              <div className='flex items-center justify-between gap-4'>
                                <span className='text-muted-foreground'>From previous</span>
                                <span className='font-mono tabular-nums'>{fromPrev.toFixed(1)}%</span>
                              </div>
                              <div className='flex items-center justify-between gap-4'>
                                <span className='text-muted-foreground'>Drop-off</span>
                                <span className='font-mono tabular-nums'>{compactNumber(dropOff)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }}
          />
          {series.map(s => (
            <Bar key={s.label} dataKey={s.label} fill={s.color} radius={[4, 4, 0, 0]}>
              {!isMultiSeries &&
                s.steps.map((step, i) => <Cell key={`cell-${i}`} fill={getSeriesColor(step.name, i).line} />)}
            </Bar>
          ))}
        </ReBarChart>
      </ChartContainer>
    </div>
  )
}

// ── Breakdown view (chart + series list with checkboxes) ─────────────────────

const DEFAULT_VISIBLE = 10

export const FunnelBreakdownView = ({ series }: { series: FunnelSeriesData[] }) => {
  const [visibleLabels, setVisibleLabels] = useState<Set<string>>(
    () => new Set(series.slice(0, DEFAULT_VISIBLE).map(s => s.label))
  )

  // Reset visible selection when the series labels change (new query result / different breakdown)
  const prevLabelsRef = useRef<string>('')
  const labelsKey = series.map(s => s.label).join('\0')
  useEffect(() => {
    if (prevLabelsRef.current === labelsKey) return
    prevLabelsRef.current = labelsKey
    setVisibleLabels(new Set(series.slice(0, DEFAULT_VISIBLE).map(s => s.label)))
  }, [labelsKey, series])

  const visibleSeries = useMemo(() => series.filter(s => visibleLabels.has(s.label)), [series, visibleLabels])

  const seriesStats = useMemo(
    () =>
      series.map(s => {
        const first = Math.max(s.steps[0]?.count ?? 0, 0)
        const last = Math.max(s.steps[s.steps.length - 1]?.count ?? 0, 0)
        return { ...s, rate: first > 0 ? (last / first) * 100 : 0, completed: last }
      }),
    [series]
  )

  const highestConv = seriesStats.reduce((best, s) => (s.rate > best.rate ? s : best), seriesStats[0])
  const mostCompleted = seriesStats.reduce((best, s) => (s.completed > best.completed ? s : best), seriesStats[0])

  const toggleSeries = (label: string) =>
    setVisibleLabels(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })

  if (!seriesStats.length) return null

  return (
    <div className='mt-4 space-y-4'>
      {/* Summary stats */}
      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-0.5'>
          <p className='text-xs text-muted-foreground'>Highest conversion rate</p>
          <div className='flex items-baseline gap-2'>
            <span className='text-sm font-medium'>{highestConv?.label}</span>
            <span className='text-2xl font-semibold tabular-nums'>{highestConv?.rate.toFixed(1)}%</span>
          </div>
        </div>
        <div className='space-y-0.5'>
          <p className='text-xs text-muted-foreground'>Most conversions</p>
          <div className='flex items-baseline gap-2'>
            <span className='text-sm font-medium'>{mostCompleted?.label}</span>
            <span className='text-2xl font-semibold tabular-nums'>{compactNumber(mostCompleted?.completed ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* Chart — only visible series */}
      {visibleSeries.length > 0 && <FunnelChart series={visibleSeries} />}

      {/* Series list */}
      <div>
        {seriesStats.map(s => {
          const isVisible = visibleLabels.has(s.label)
          return (
            <div
              key={s.label}
              className='group flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded-sm transition-colors cursor-pointer'
              onClick={() => toggleSeries(s.label)}
            >
              <span
                className='w-3.5 h-3.5 rounded-sm border-2 shrink-0 transition-colors flex items-center justify-center'
                style={{ borderColor: s.color, background: isVisible ? s.color : 'transparent' }}
              >
                {isVisible && <Check className='w-2.5 h-2.5 text-white' strokeWidth={3} />}
              </span>
              <span className='text-sm flex-1 min-w-0 truncate'>{s.label}</span>
              <span className='text-xs text-muted-foreground'>Conversion</span>
              <span className='text-xs font-medium tabular-nums w-12 text-right'>{s.rate.toFixed(1)}%</span>
              <span className='text-xs text-muted-foreground ml-3'>Completed</span>
              <span className='text-xs font-medium tabular-nums w-14 text-right'>{compactNumber(s.completed)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
