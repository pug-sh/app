import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, Cell, BarChart as ReBarChart, XAxis, YAxis } from 'recharts'
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { getSeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'

// All series in a single chart must share the same step skeleton (same names,
// same order). The chart aligns by index across series and assumes that contract.
export interface FunnelSeriesData {
  label: string
  steps: ReadonlyArray<{ readonly name: string; readonly count: number }>
  color: string
}

// ── Chart (single or grouped bars) ──────────────────────────────────────────

// Underscore-prefixed row keys so neither the x-axis category nor per-series
// metrics collide with arbitrary user-supplied event/series names.
type ChartRow = Record<string, number | string>

const STEP_KEY = '__step'
const valueKey = (si: number) => `s${si}__value`
const countKey = (si: number) => `s${si}__count`
const fromPrevKey = (si: number) => `s${si}__fromPrev`
const dropOffKey = (si: number) => `s${si}__dropOff`

export const FunnelChart = ({ series, colorByStep }: { series: FunnelSeriesData[]; colorByStep?: boolean }) => {
  const isMultiSeries = series.length > 1
  // Single series → per-step palette; multi-series → per-series color so series identity wins.
  const useStepColors = colorByStep ?? !isMultiSeries
  // Skeleton comes from series[0]; all series must share it (see FunnelSeriesData doc).
  const stepNames = useMemo(() => {
    const names = series[0]?.steps.map(s => s.name) ?? []
    const misaligned = series.some(
      s => s.steps.length !== names.length || s.steps.some((step, i) => step.name !== names[i]),
    )
    if (misaligned) {
      console.error(
        'FunnelChart: series have mismatched step shapes; rendering aligns by index of series[0] and will silently zero-fill divergent series.',
      )
    }
    return names
  }, [series])

  const chartData = useMemo<ChartRow[]>(
    () =>
      stepNames.map((stepName, stepIdx) => {
        const row: ChartRow = { [STEP_KEY]: stepName }
        series.forEach((s, si) => {
          const firstCount = s.steps[0]?.count ?? 0
          const stepCount = s.steps[stepIdx]?.count ?? 0
          const prevStep = stepIdx > 0 ? s.steps[stepIdx - 1] : undefined
          const prevMissing = stepIdx > 0 && prevStep === undefined
          const prevCount = prevStep?.count ?? 0
          row[valueKey(si)] = firstCount > 0 ? Number(((stepCount / firstCount) * 100).toFixed(2)) : 0
          row[countKey(si)] = stepCount
          // NaN sentinel for "missing prev step"; tooltip renders it as —.
          row[fromPrevKey(si)] = prevMissing
            ? NaN
            : stepIdx === 0
              ? 100
              : prevCount > 0
                ? Number(((stepCount / prevCount) * 100).toFixed(2))
                : 0
          // Drop-off is undefined for step 0 (no previous) and for misaligned series; NaN sentinel hides the row.
          row[dropOffKey(si)] = stepIdx === 0 || prevMissing ? NaN : prevCount - stepCount
        })
        return row
      }),
    [series, stepNames],
  )

  const chartConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(series.map((s, si) => [valueKey(si), { label: s.label, color: s.color }])),
    [series],
  )

  if (series.length === 0 || stepNames.length === 0) return null

  return (
    <div className="mt-4 rounded-lg border border-border/60 p-4">
      <ChartContainer config={chartConfig} className="h-64 w-full">
        <ReBarChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 8 }} barCategoryGap="20%" barGap={2}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={STEP_KEY} tickLine={false} axisLine={false} interval={0} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            domain={[0, 100]}
            tickFormatter={(value: number) => `${value}%`}
          />
          <ChartTooltip
            cursor={{ fill: 'transparent' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0]?.payload as ChartRow
              const step = row[STEP_KEY] as string
              return (
                <div className="rounded-lg border border-border bg-popover p-2.5 shadow-sm text-xs min-w-[160px]">
                  <p className="font-medium text-foreground mb-1.5">{step}</p>
                  {series.map((s, si) => {
                    const count = row[countKey(si)] as number
                    const conv = row[valueKey(si)] as number
                    const fromPrev = row[fromPrevKey(si)] as number
                    const dropOff = row[dropOffKey(si)] as number
                    return (
                      <div key={si} className="py-1 border-t border-border/50 first:border-0 first:pt-0">
                        {isMultiSeries && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                            <span className="font-medium text-foreground">{s.label}</span>
                          </div>
                        )}
                        <div className="space-y-0.5 pl-3.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">Completed</span>
                            <span className="font-mono tabular-nums">{compactNumber(count)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">From start</span>
                            <span className="font-mono tabular-nums">{conv.toFixed(1)}%</span>
                          </div>
                          {!isMultiSeries && (
                            <>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">From previous</span>
                                <span className="font-mono tabular-nums">
                                  {Number.isFinite(fromPrev) ? `${fromPrev.toFixed(1)}%` : '—'}
                                </span>
                              </div>
                              {Number.isFinite(dropOff) && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-muted-foreground">Drop-off</span>
                                  <span className="font-mono tabular-nums">{compactNumber(dropOff)}</span>
                                </div>
                              )}
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
          {series.map((s, si) => (
            <Bar key={si} dataKey={valueKey(si)} fill={s.color} radius={[4, 4, 0, 0]}>
              {useStepColors &&
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
  // Visibility tracked by label (not index) so user toggles persist when bucket
  // ordering shifts. null = use default (first DEFAULT_VISIBLE entries).
  const [visibleLabels, setVisibleLabels] = useState<Set<string> | null>(null)
  const defaultVisibleLabels = useMemo(() => new Set(series.slice(0, DEFAULT_VISIBLE).map(s => s.label)), [series])
  const resolvedVisible = visibleLabels ?? defaultVisibleLabels

  const visibleSeries = useMemo(() => series.filter(s => resolvedVisible.has(s.label)), [series, resolvedVisible])

  const seriesStats = useMemo(
    () =>
      series.map(s => {
        const first = s.steps[0]?.count ?? 0
        const last = s.steps[s.steps.length - 1]?.count ?? 0
        return { ...s, rate: first > 0 ? (last / first) * 100 : 0, completed: last }
      }),
    [series],
  )

  const highestConv = seriesStats.reduce((best, s) => (s.rate > best.rate ? s : best), seriesStats[0])
  const mostCompleted = seriesStats.reduce((best, s) => (s.completed > best.completed ? s : best), seriesStats[0])
  const allRatesZero = seriesStats.every(s => s.rate === 0)
  const allCompletedZero = seriesStats.every(s => s.completed === 0)

  const toggleSeries = (label: string) =>
    setVisibleLabels(prev => {
      const next = new Set(prev ?? defaultVisibleLabels)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })

  if (!seriesStats.length) return null

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Highest conversion rate</p>
          <div className="flex items-baseline gap-2">
            {allRatesZero ? (
              <span className="text-2xl font-semibold tabular-nums text-muted-foreground">—</span>
            ) : (
              <>
                <span className="text-sm font-medium">{highestConv?.label}</span>
                <span className="text-2xl font-semibold tabular-nums">{highestConv?.rate.toFixed(1)}%</span>
              </>
            )}
          </div>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Most conversions</p>
          <div className="flex items-baseline gap-2">
            {allCompletedZero ? (
              <span className="text-2xl font-semibold tabular-nums text-muted-foreground">—</span>
            ) : (
              <>
                <span className="text-sm font-medium">{mostCompleted?.label}</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {compactNumber(mostCompleted?.completed ?? 0)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {visibleSeries.length > 0 && <FunnelChart series={visibleSeries} colorByStep={false} />}

      <div>
        {seriesStats.map(s => {
          const isVisible = resolvedVisible.has(s.label)
          return (
            <div
              key={s.label}
              className="group flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded-sm transition-colors cursor-pointer"
              onClick={() => toggleSeries(s.label)}
            >
              <span
                className="w-3.5 h-3.5 rounded-sm border-2 shrink-0 transition-colors flex items-center justify-center"
                style={{ borderColor: s.color, background: isVisible ? s.color : 'transparent' }}
              >
                {isVisible && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </span>
              <span className="text-sm flex-1 min-w-0 truncate">{s.label}</span>
              <span className="text-xs text-muted-foreground">Conversion</span>
              <span className="text-xs font-medium tabular-nums w-12 text-right">{s.rate.toFixed(1)}%</span>
              <span className="text-xs text-muted-foreground ml-3">Completed</span>
              <span className="text-xs font-medium tabular-nums w-14 text-right">{compactNumber(s.completed)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
