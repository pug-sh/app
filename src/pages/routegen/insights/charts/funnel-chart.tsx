import { useAtomValue } from 'jotai'
import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FunnelChart as VendoredFunnel } from '@/components/charts/funnel-chart'
import { resolvedThemeAtom } from '@/data/theme.atoms'
import { getSeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface FunnelSeriesData {
  label: string
  steps: ReadonlyArray<{ readonly name: string; readonly count: number }>
  color: string
}

// ── Single funnel ───────────────────────────────────────────────────────────

const formatPercentage = (pct: number) => `${Math.round(pct)}%`

// Step names repeat whenever a funnel revisits an event (page_view → signup →
// page_view). The vendored chart keys its segments by label, so make them unique.
const uniqueStepLabels = (steps: FunnelSeriesData['steps']) => {
  const seen = new Map<string, number>()
  return steps.map(step => {
    const count = seen.get(step.name) ?? 0
    seen.set(step.name, count + 1)
    if (count === 0) return step.name
    return `${step.name} (${count + 1})`
  })
}

// Wraps the vendored funnel (src/components/charts) — never edit that directory.
// It renders values, percentage and step name inline; the drop-off tooltip and
// the step palette are ours to inject through props.
const SingleFunnel = ({
  steps,
  color,
  colorByStep,
  compact = false,
}: {
  steps: FunnelSeriesData['steps']
  color: string
  colorByStep: boolean
  compact?: boolean
}) => {
  const [hovered, setHovered] = useState<number | null>(null)
  // getSeriesColor resolves against theme-dependent module state, which can't
  // invalidate a memo on its own — read the theme so a toggle re-derives.
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  const stages = useMemo(() => {
    const labels = uniqueStepLabels(steps)
    return steps.map((step, i) => ({
      label: labels[i] ?? step.name,
      value: step.count,
      color: colorByStep ? getSeriesColor(step.name, i).line : color,
    }))
  }, [steps, color, colorByStep, resolvedTheme])

  const detail = useMemo(() => {
    const step = hovered === null ? undefined : steps[hovered]
    if (hovered === null || !step) return null

    const first = steps[0]?.count ?? 0
    const fromStart = first > 0 ? (step.count / first) * 100 : 0
    if (hovered === 0) return { step, fromStart, fromPrev: null, dropOff: null }

    const prev = steps[hovered - 1]?.count ?? 0
    const fromPrev = prev > 0 ? (step.count / prev) * 100 : 0
    return { step, fromStart, fromPrev, dropOff: prev - step.count }
  }, [hovered, steps])

  // Anchor the tooltip over the hovered segment, biting back at the edges so the
  // panel stays inside the chart instead of overflowing the tile.
  const anchor = hovered === null ? 0 : ((hovered + 0.5) / steps.length) * 100
  const anchorShift = () => {
    if (anchor < 15) return '0'
    if (anchor > 85) return '-100%'
    return '-50%'
  }

  return (
    <div className={cn('relative', compact && 'h-full min-h-0')}>
      <VendoredFunnel
        className={compact ? 'h-full' : undefined}
        color={color}
        data={stages}
        formatPercentage={formatPercentage}
        formatValue={compactNumber}
        grid={{ bands: false }}
        hoveredIndex={hovered}
        onHoverChange={setHovered}
        showValues={!compact}
        style={compact ? { aspectRatio: 'auto' } : undefined}
      />
      {detail && (
        <div
          className="pointer-events-none absolute top-0 z-30 w-max min-w-[150px] rounded-lg border border-border bg-popover p-2.5 shadow-sm text-xs"
          style={{ left: `${anchor}%`, transform: `translateX(${anchorShift()})` }}
        >
          <p className="font-medium text-foreground mb-1.5">{detail.step.name}</p>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Completed</span>
              <span className="tabular-nums">{compactNumber(detail.step.count)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">From start</span>
              <span className="tabular-nums">{detail.fromStart.toFixed(1)}%</span>
            </div>
            {detail.fromPrev !== null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">From previous</span>
                <span className="tabular-nums">{detail.fromPrev.toFixed(1)}%</span>
              </div>
            )}
            {detail.dropOff !== null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Drop-off</span>
                <span className="tabular-nums">{compactNumber(detail.dropOff)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Chart (one funnel, or small multiples per breakdown split) ──────────────

export const FunnelChart = ({
  series,
  colorByStep,
  compact = false,
  className,
}: {
  series: FunnelSeriesData[]
  colorByStep?: boolean
  compact?: boolean
  className?: string
}) => {
  const [first, ...rest] = series
  if (!first || first.steps.length === 0) return null

  // Single series → per-step palette; a breakdown → per-series color so series identity wins.
  const useStepColors = colorByStep ?? rest.length === 0

  if (rest.length === 0) {
    return (
      <div className={cn(compact ? 'flex h-full min-h-0 flex-col' : 'mt-4 p-4', className)}>
        <SingleFunnel colorByStep={useStepColors} color={first.color} compact={compact} steps={first.steps} />
      </div>
    )
  }

  // The vendored chart draws exactly one funnel, so a breakdown becomes small
  // multiples — each split keeps its own taper instead of sharing a bar group.
  return (
    <div className={cn('mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2', className)}>
      {series.map(s => (
        <div key={s.label} className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-xs font-medium truncate">{s.label}</span>
          </div>
          <SingleFunnel colorByStep={useStepColors} color={s.color} steps={s.steps} />
        </div>
      ))}
    </div>
  )
}

// ── Breakdown view (small multiples + series list with checkboxes) ───────────

// Small multiples cost far more room than the grouped bars they replaced, so the
// default shows fewer splits; the list below toggles the rest in.
const DEFAULT_VISIBLE = 4

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
          <p className="text-xs font-normal text-muted-foreground">Highest conversion rate</p>
          <div className="flex items-baseline gap-2">
            {allRatesZero ? (
              <span className="text-lg font-medium tabular-nums text-muted-foreground">—</span>
            ) : (
              <>
                <span className="text-sm font-medium">{highestConv?.label}</span>
                <span className="text-lg font-medium tabular-nums text-foreground">
                  {highestConv?.rate.toFixed(1)}%
                </span>
              </>
            )}
          </div>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-normal text-muted-foreground">Most conversions</p>
          <div className="flex items-baseline gap-2">
            {allCompletedZero ? (
              <span className="text-lg font-medium tabular-nums text-muted-foreground">—</span>
            ) : (
              <>
                <span className="text-sm font-medium">{mostCompleted?.label}</span>
                <span className="text-lg font-medium tabular-nums text-foreground">
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
                {isVisible && <Check className="w-2.5 h-2.5 text-white dark:text-black" strokeWidth={3} />}
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
