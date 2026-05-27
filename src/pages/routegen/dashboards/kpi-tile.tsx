import { useMemo } from 'react'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { TrendSeries } from '@/api/genproto/shared/insights/v1/insights_pb'
import { accentTextClass, toneTextClass } from './accent-palette'
import { evaluateThresholds } from './thresholds'

type KpiTileProps = {
  tile: DashboardTile
  currentSeries: TrendSeries[]
  priorSeries: TrendSeries[] | undefined
  comparisonLabel: string | undefined
  formatValue: (value: number) => string
}

// Sum all points across all series. KPI tiles aren't designed for multi-series
// queries, but if the underlying spec yields multiple series we collapse to a
// single number rather than render nothing.
const summarize = (series: TrendSeries[]): number =>
  series.reduce((seriesAcc, s) => seriesAcc + s.points.reduce((pointAcc, p) => pointAcc + p.value, 0), 0)

const formatDelta = (current: number, prior: number): string | null => {
  if (!Number.isFinite(prior) || prior === 0) return null
  const pct = ((current - prior) / Math.abs(prior)) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

export const KpiTile = ({ tile, currentSeries, priorSeries, comparisonLabel, formatValue }: KpiTileProps) => {
  const current = useMemo(() => summarize(currentSeries), [currentSeries])
  const prior = useMemo(() => (priorSeries ? summarize(priorSeries) : undefined), [priorSeries])
  const tone = useMemo(() => evaluateThresholds(current, tile.thresholds), [current, tile.thresholds])

  const numberColor = tone === null ? accentTextClass(tile.header?.accentColor ?? '') : toneTextClass(tone)
  const delta = prior !== undefined ? formatDelta(current, prior) : null
  const deltaClass =
    delta === null ? 'text-muted-foreground' : delta.startsWith('+') ? 'text-emerald-500' : 'text-red-500'

  const sparkPoints = useMemo(() => currentSeries[0]?.points ?? [], [currentSeries])

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5">
      <div className={`text-3xl font-semibold tracking-tight tabular-nums ${numberColor}`}>{formatValue(current)}</div>
      {delta !== null && comparisonLabel ? (
        <div className={`text-xs ${deltaClass}`}>
          {delta} {comparisonLabel}
        </div>
      ) : null}
      {sparkPoints.length >= 2 ? <Sparkline points={sparkPoints} /> : null}
    </div>
  )
}

const Sparkline = ({ points }: { points: { value: number }[] }) => {
  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 100
  const h = 24
  const path = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w
      const y = h - ((v - min) / range) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-6 w-full text-muted-foreground/60"
      aria-hidden
    >
      <title>Recent trend</title>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.25} />
    </svg>
  )
}
