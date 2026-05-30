import { TrendingDown, TrendingUp } from 'lucide-react'
import { useId, useMemo } from 'react'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { TrendSeries } from '@/api/genproto/shared/insights/v1/insights_pb'
import { cn } from '@/lib/utils'
import { accentTextClass, toneTextClass } from './accent-palette'
import { evaluateThresholds } from './thresholds'

export type KpiCompare = { series: TrendSeries[]; label: string } | { error: true; label: string }

type KpiTileProps = {
  tile: DashboardTile
  currentSeries: TrendSeries[]
  compare?: KpiCompare
  formatValue: (value: number) => string
  metadata?: string
}

// Sum all points across all series. KPI tiles aren't designed for multi-series
// queries, but if the underlying spec yields multiple series we collapse to a
// single number rather than render nothing. Returns NaN when there are no
// series at all so the renderer can distinguish "no data" from a true zero.
const summarize = (series: TrendSeries[]): number => {
  if (series.length === 0) return Number.NaN
  return series.reduce((seriesAcc, s) => seriesAcc + s.points.reduce((pointAcc, p) => pointAcc + p.value, 0), 0)
}

const formatDelta = (current: number, prior: number): { pct: number; label: string } | null => {
  if (!Number.isFinite(prior) || prior === 0) return null
  if (!Number.isFinite(current)) return null
  const pct = ((current - prior) / Math.abs(prior)) * 100
  return { pct, label: `${Math.abs(pct).toFixed(1)}%` }
}

const DeltaBadge = ({ pct, label }: { pct: number; label: string }) => {
  const positive = pct >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        positive
          ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
          : 'bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-400',
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {label}
    </span>
  )
}

export const KpiTile = ({ tile, currentSeries, compare, formatValue, metadata }: KpiTileProps) => {
  const current = useMemo(() => summarize(currentSeries), [currentSeries])
  const prior = useMemo(() => (compare && 'series' in compare ? summarize(compare.series) : undefined), [compare])
  const tone = useMemo(() => evaluateThresholds(current, tile.thresholds), [current, tile.thresholds])

  const numberColor = tone === null ? accentTextClass(tile.header?.accentColor ?? '') : toneTextClass(tone)
  const delta = prior !== undefined ? formatDelta(current, prior) : null

  const sparkPoints = useMemo(() => currentSeries[0]?.points ?? [], [currentSeries])
  const showSparkline = tile.visualization?.hideSparkline !== true && sparkPoints.length >= 2

  // Sparkline hue tracks the trend vs the comparison period; neutral when there
  // is nothing to compare against.
  const sparkColor =
    prior === undefined || !Number.isFinite(prior)
      ? 'text-muted-foreground/70'
      : current >= prior
        ? 'text-emerald-500'
        : 'text-red-500'

  const contextParts = [compare && 'series' in compare ? compare.label : null, metadata].filter(Boolean)

  const compareRow =
    compare && 'error' in compare ? (
      <div className="text-xs text-muted-foreground">Compare unavailable · {compare.label}</div>
    ) : delta !== null && compare && 'series' in compare ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <DeltaBadge pct={delta.pct} label={delta.label} />
        {contextParts.length > 0 ? (
          <span className="text-xs text-muted-foreground">{contextParts.join(' · ')}</span>
        ) : null}
      </div>
    ) : contextParts.length > 0 ? (
      <span className="text-xs text-muted-foreground">{contextParts.join(' · ')}</span>
    ) : null

  const summary = (
    <div className="space-y-2">
      <div className={cn('text-3xl font-semibold tracking-tight tabular-nums', numberColor)}>
        {formatValue(current)}
      </div>
      {compareRow}
    </div>
  )

  // No sparkline → stack value + delta from the top. With a sparkline → value +
  // delta on top and the area chart anchored to the bottom, filling the tile.
  if (!showSparkline) {
    return <div className="flex h-full min-h-0 flex-col justify-center">{summary}</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {summary}
      <div className={`mt-3 min-h-0 flex-1 ${sparkColor}`}>
        <Sparkline points={sparkPoints} />
      </div>
    </div>
  )
}

// Area sparkline: a soft gradient fill (trend color → transparent) under a
// constant-width line. preserveAspectRatio="none" lets it stretch to the tile
// width; vectorEffect keeps the stroke crisp despite the non-uniform scale.
const Sparkline = ({ points }: { points: { value: number }[] }) => {
  const gradientId = `spark-${useId().replace(/:/g, '')}`
  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 100
  const h = 32
  const coords = values.map((value, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w
    const y = h - ((value - min) / range) * h
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const linePath = coords.map((point, i) => `${i === 0 ? 'M' : 'L'}${point}`).join(' ')
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      <title>Recent trend</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
