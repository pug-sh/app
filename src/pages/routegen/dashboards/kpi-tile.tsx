import { timestampDate } from '@bufbuild/protobuf/wkt'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { type ReactNode, useEffect, useMemo } from 'react'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { TrendSeries } from '@/api/genproto/shared/insights/v1/insights_pb'
import { ParentSize } from '@/components/charts/chart-parent-size'
import { AreaSparkline, useSparklineHover } from '@/components/charts/sparkline'
import { cn } from '@/lib/utils'
import { collapseValues, SERIES_COLLAPSE, type SeriesAggregationResolver } from '../insights/helpers'
import { toneTextClass } from './accent-palette'
import { evaluateThresholds } from './thresholds'

export type KpiCompare =
  | { series: TrendSeries[]; label: string }
  | { error: true; label: string }
  | { pending: true; label: string }

type KpiTileProps = {
  tile: DashboardTile
  currentSeries: TrendSeries[]
  // Resolves a series to the aggregation that produced it. Applies to `compare`'s series too, which
  // is why it's a function: that's a different query's result and shares nothing but the spec.
  aggregationFor: SeriesAggregationResolver
  compare?: KpiCompare
  formatValue: (value: number) => string
  formatDate: (date: Date) => string
  metadata?: string
  lightMetric?: boolean
  // Only for a settled count: a pending query, or an average of nothing, has no value, not zero.
  zeroWhenEmpty?: boolean
}

// KPI tiles aren't designed for multi-series queries, but if the underlying spec
// yields multiple series we collapse to a single number rather than render
// nothing. Returns NaN when there are no series at all so the renderer can
// distinguish "no data" from a true zero.
//
// Each series is asked what produced it rather than being read off a position, so the comparison
// window (a separate query, with its own series) summarizes correctly instead of borrowing the
// current window's order. Only counts sum; SERIES_COLLAPSE decides.
const summarize = (series: TrendSeries[], aggregationFor: SeriesAggregationResolver) => {
  if (series.length === 0) return Number.NaN
  return series.reduce(
    (acc, entry) =>
      acc +
      collapseValues(
        entry.points.map(point => point.value),
        SERIES_COLLAPSE[aggregationFor(entry)],
      ),
    0,
  )
}

// Exported so the traffic stat tiles show the identical increasing/decreasing badge: one
// source of truth for the delta visual across both overview modes.
export const formatDelta = (current: number, prior: number): { pct: number; label: string } | null => {
  if (!Number.isFinite(prior) || prior === 0) return null
  if (!Number.isFinite(current)) return null
  const pct = ((current - prior) / Math.abs(prior)) * 100
  return { pct, label: `${Math.abs(pct).toFixed(1)}%` }
}

export const DeltaBadge = ({
  pct,
  label,
  lowerIsBetter = false,
}: {
  pct: number
  label: string
  lowerIsBetter?: boolean
}) => {
  const rising = pct >= 0
  const Icon = rising ? TrendingUp : TrendingDown
  // The arrow follows the number, the color follows whether that direction is good. They diverge for
  // lower-is-better metrics like bounce rate, where a climbing value is a regression, not a win.
  const good = lowerIsBetter ? pct <= 0 : pct >= 0
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs tabular-nums',
        'font-medium',
        good
          ? 'bg-success/15 text-positive dark:bg-success/10'
          : 'bg-destructive/15 text-negative dark:bg-destructive/10',
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {label}
    </span>
  )
}

export const KpiTile = ({
  tile,
  currentSeries,
  aggregationFor,
  compare,
  formatValue,
  formatDate,
  metadata,
  lightMetric,
  zeroWhenEmpty = false,
}: KpiTileProps) => {
  const current = useMemo(
    () => (zeroWhenEmpty && currentSeries.length === 0 ? 0 : summarize(currentSeries, aggregationFor)),
    [currentSeries, aggregationFor, zeroWhenEmpty],
  )
  const prior = useMemo(
    () => (compare && 'series' in compare ? summarize(compare.series, aggregationFor) : undefined),
    [compare, aggregationFor],
  )
  const tone = useMemo(() => evaluateThresholds(current, tile.thresholds), [current, tile.thresholds])

  // No threshold tone → body ink. The accent strip is the affordance for the header's chosen
  // color, so data state (tone) stays the only thing that recolors the number.
  const numberColor = tone === null ? undefined : toneTextClass(tone)
  const delta = prior !== undefined ? formatDelta(current, prior) : null

  const sparkPoints = useMemo(() => currentSeries[0]?.points ?? [], [currentSeries])
  const showSparkline = tile.visualization?.hideSparkline !== true && sparkPoints.length >= 2
  // The sparkline draws only the first series, while the headline totals them all.
  const readout = showSparkline && currentSeries.length === 1
  const hover = useSparklineHover()
  const hovered = readout && hover.index !== null ? sparkPoints[hover.index] : undefined

  // Sparkline hue tracks the trend vs the comparison period; neutral when there
  // is nothing to compare against.
  const sparkColor =
    prior === undefined || !Number.isFinite(prior) ? 'text-faint' : current >= prior ? 'text-positive' : 'text-negative'

  const contextParts = [compare && !('error' in compare) ? compare.label : null, metadata].filter(Boolean)

  const deltaRow = (badge: ReactNode, className?: string) => (
    <div className={cn('flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1', className)}>
      {badge}
      {contextParts.length > 0 ? (
        <span className="text-xs text-muted-foreground">{contextParts.join(' · ')}</span>
      ) : null}
    </div>
  )

  const compareRow =
    compare && 'error' in compare ? (
      <div className="text-xs text-muted-foreground">Compare unavailable · {compare.label}</div>
    ) : compare && 'pending' in compare ? (
      // Holds the row's space while the comparison loads, so the tile doesn't grow when it lands.
      deltaRow(<DeltaBadge pct={0} label="0.0%" />, 'invisible')
    ) : compare && 'series' in compare ? (
      deltaRow(delta && <DeltaBadge pct={delta.pct} label={delta.label} />)
    ) : contextParts.length > 0 ? (
      <span className="text-xs text-muted-foreground">{contextParts.join(' · ')}</span>
    ) : null

  // A bucket's value isn't the window's, so the window's tone and compare row step aside. The row keeps its space so
  // the sparkline doesn't resize under the pointer.
  const summary = (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div
          className={cn('tracking-tight tabular-nums', lightMetric ? 'text-4xl' : 'text-3xl', !hovered && numberColor)}
        >
          {formatValue(hovered?.value ?? current)}
        </div>
        {hovered?.time ? (
          <span className="truncate text-xs tabular-nums text-muted-foreground">
            {formatDate(timestampDate(hovered.time))}
          </span>
        ) : null}
      </div>
      {compareRow ? <div className={hovered ? 'invisible' : undefined}>{compareRow}</div> : null}
    </div>
  )

  if (!showSparkline) {
    return <div className="flex h-full min-h-0 flex-col justify-center">{summary}</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {summary}
      <div aria-hidden className={`mt-3 min-h-0 flex-1 ${sparkColor}`}>
        <Sparkline points={sparkPoints} {...(readout ? hover.sparklineProps : undefined)} />
      </div>
    </div>
  )
}

// baseline='min' scales to the data's own range, emphasizing shape. baseline='zero' floors it at 0 so a near-constant
// metric reads flat instead of amplifying its noise; the traffic cards use it to match their 0-based main chart.
export const Sparkline = ({
  points,
  baseline = 'min',
  strokeWidth = 1.75,
  hoverIndex,
  onHoverChange,
}: {
  points: { value: number }[]
  baseline?: 'min' | 'zero'
  strokeWidth?: number
  hoverIndex?: number | null
  onHoverChange?: (index: number | null, datum: unknown) => void
}) => {
  // An svg unmounted under the pointer never gets its pointerleave, so the caller's hover would outlive it.
  useEffect(() => () => onHoverChange?.(null, null), [onHoverChange])
  const floor = baseline === 'zero' ? 0 : undefined
  // The vendored domain centers a flat series, which would float an all-zero window off the floor.
  const ceiling = points.every(p => p.value === 0) ? 1 : undefined

  return (
    <ParentSize>
      {({ width, height }) => (
        <AreaSparkline
          data={points}
          dataKey="value"
          width={width}
          height={height}
          color="currentColor"
          strokeWidth={strokeWidth}
          fillOpacity={0.22}
          padding={0}
          yDomain={[floor, ceiling]}
          crosshair="gradient"
          // Edge to edge, so a dot on the first, last or lowest bucket would be cut in half by the tile.
          dot={false}
          interactive={onHoverChange !== undefined}
          hoverIndex={hoverIndex}
          onHoverChange={onHoverChange}
        />
      )}
    </ParentSize>
  )
}
