import { useId, useMemo } from 'react'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { TrendSeries } from '@/api/genproto/shared/insights/v1/insights_pb'
import { accentTextClass, toneTextClass } from './accent-palette'
import { evaluateThresholds } from './thresholds'

export type KpiCompare = { series: TrendSeries[]; label: string } | { error: true; label: string }

type KpiTileProps = {
  tile: DashboardTile
  currentSeries: TrendSeries[]
  compare?: KpiCompare
  formatValue: (value: number) => string
}

// Sum all points across all series. KPI tiles aren't designed for multi-series
// queries, but if the underlying spec yields multiple series we collapse to a
// single number rather than render nothing. Returns NaN when there are no
// series at all so the renderer can distinguish "no data" from a true zero.
const summarize = (series: TrendSeries[]): number => {
  if (series.length === 0) return Number.NaN
  return series.reduce((seriesAcc, s) => seriesAcc + s.points.reduce((pointAcc, p) => pointAcc + p.value, 0), 0)
}

const formatDelta = (current: number, prior: number): string | null => {
  if (!Number.isFinite(prior) || prior === 0) return null
  if (!Number.isFinite(current)) return null
  const pct = ((current - prior) / Math.abs(prior)) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

export const KpiTile = ({ tile, currentSeries, compare, formatValue }: KpiTileProps) => {
  const current = useMemo(() => summarize(currentSeries), [currentSeries])
  const prior = useMemo(() => (compare && 'series' in compare ? summarize(compare.series) : undefined), [compare])
  const tone = useMemo(() => evaluateThresholds(current, tile.thresholds), [current, tile.thresholds])

  const numberColor = tone === null ? accentTextClass(tile.header?.accentColor ?? '') : toneTextClass(tone)
  const delta = prior !== undefined ? formatDelta(current, prior) : null
  const deltaClass =
    delta === null ? 'text-muted-foreground' : delta.startsWith('+') ? 'text-emerald-500' : 'text-red-500'

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

  const summary = (
    <div className="space-y-1">
      <div className={`text-3xl font-semibold tracking-tight tabular-nums ${numberColor}`}>{formatValue(current)}</div>
      {compare && 'error' in compare ? (
        <div className="text-muted-foreground text-xs">Compare unavailable · {compare.label}</div>
      ) : delta !== null && compare && 'series' in compare ? (
        <div className={`text-xs ${deltaClass}`}>
          {delta} {compare.label}
        </div>
      ) : null}
    </div>
  )

  // No sparkline → center the value + delta as a clean stat. With a sparkline →
  // value + delta on top and the area chart anchored to the bottom, filling the tile.
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
