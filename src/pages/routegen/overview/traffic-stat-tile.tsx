import { timestampDate } from '@bufbuild/protobuf/wkt'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { type Granularity, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { useSparklineHover } from '@/components/charts/sparkline'
import type { TimeRange } from '@/components/date-range-picker'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { Button } from '@/components/ui/button'
import { activeProjectTimezoneAtom } from '@/data/workspace.atoms'
import { alignRangeStart } from '@/lib/granularity'
import { cn } from '@/lib/utils'
import { priorPeriodRange } from '../dashboards/compare-query'
import { DeltaBadge, formatDelta, Sparkline } from '../dashboards/kpi-tile'
import { formatTooltipDate } from '../insights/charts/helpers'
import {
  buildTrafficStatQuery,
  formatTrafficStatValue,
  getTrafficStat,
  type NavEvent,
  type TrafficStatId,
} from './traffic-queries'
import { useTrafficQuery } from './use-traffic-query'

// A single headline stat: the exact window scalar (SegmentationResult.total) for its metric, a
// compare-vs-prior delta badge (matching the product KPI tiles), and a sparkline of the metric over
// the window. The selected tile drives the main chart and reads in the accent color.
export const TrafficStatTile = ({
  statId,
  nav,
  selected,
  onSelect,
  range,
  granularity,
  filters,
}: {
  statId: TrafficStatId
  nav: NavEvent
  selected: boolean
  onSelect: (id: TrafficStatId) => void
  range: TimeRange
  granularity: Granularity
  filters: readonly ActiveFilter[]
}) => {
  const stat = getTrafficStat(statId)
  const label = stat.label[nav.kind]
  const timeZone = useAtomValue(activeProjectTimezoneAtom)
  const scalarQuery = useMemo(
    () => buildTrafficStatQuery(nav.name, statId, InsightType.SEGMENTATION, filters),
    [nav, statId, filters],
  )
  const trendQuery = useMemo(
    () => buildTrafficStatQuery(nav.name, statId, InsightType.TRENDS, filters),
    [nav, statId, filters],
  )
  // Derived from the window useTrafficQuery actually sends, not the raw one, so the delta compares two
  // equal-length adjacent periods (see DashboardInsightContent).
  const alignedRange = useMemo(
    () => ({ from: alignRangeStart(range, granularity, timeZone), to: range.to }),
    [range, granularity, timeZone],
  )
  const priorRange = useMemo(
    () => priorPeriodRange({ queried: alignedRange, selected: range, timeZone }),
    [alignedRange, range, timeZone],
  )

  const { result, error, retry, loading } = useTrafficQuery(
    scalarQuery,
    range,
    granularity,
    `overview-traffic-stat-${statId}`,
  )
  const { result: priorResult, retry: retryPrior } = useTrafficQuery(
    scalarQuery,
    priorRange,
    granularity,
    `overview-traffic-stat-${statId}-prev`,
    false,
  )
  const { result: trendResult, retry: retryTrend } = useTrafficQuery(
    trendQuery,
    range,
    granularity,
    `overview-traffic-spark-${statId}`,
  )
  const hover = useSparklineHover()

  // The scalar query drives the headline number; when it fails the tile has nothing to show, so
  // surface the error with a retry (like the breakdown panels) rather than a bare '—' that reads as
  // an empty window. One tap re-runs all three tile queries: they fail together on a transient
  // error. Rendered as a <div>: the Retry button can't nest inside the selection <button> below.
  if (error) {
    return (
      <div className="flex h-[8.5rem] min-h-0 flex-col rounded-lg border border-border/60 bg-card px-4 py-3 text-left">
        <span className="truncate text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2">
          <span className="text-xs text-muted-foreground" title={error}>
            Failed to load
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              retry()
              retryPrior()
              retryTrend()
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const value = result.case === 'segmentation' ? result.value.total : undefined
  const priorValue = priorResult.case === 'segmentation' ? priorResult.value.total : undefined
  const delta = value !== undefined && priorValue !== undefined ? formatDelta(value, priorValue) : null
  const sparkPoints = trendResult.case === 'trends' ? (trendResult.value.series[0]?.points ?? []) : []
  const hovered = hover.index !== null ? sparkPoints[hover.index] : undefined
  const shown = hovered?.value ?? value

  return (
    <button
      type="button"
      onClick={() => onSelect(statId)}
      aria-pressed={selected}
      className={cn(
        'flex h-[8.5rem] min-h-0 flex-col overflow-hidden rounded-lg border px-4 py-3 text-left transition-colors',
        selected
          ? 'border-primary/50 bg-primary/[0.07]'
          : 'border-border/60 bg-card hover:border-border hover:bg-accent/40',
      )}
    >
      {/* min-h reserves the badge row so numbers stay aligned across tiles whether or not a delta is present. */}
      <div className="flex min-h-[1.375rem] items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">{label}</span>
        {hovered?.time ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatTooltipDate(timestampDate(hovered.time), granularity, timeZone)}
          </span>
        ) : (
          delta && <DeltaBadge pct={delta.pct} label={delta.label} lowerIsBetter={stat.lowerIsBetter} />
        )}
      </div>
      <span
        className={cn(
          'mt-1 text-4xl tracking-tight tabular-nums',
          loading && value === undefined && 'animate-pulse opacity-40',
        )}
      >
        {shown !== undefined ? formatTrafficStatValue(statId, shown) : '—'}
      </span>

      {/* Fixed shallow band pinned to the bottom edge: given the full leftover height the vertical stretch
          exaggerated every wiggle and the trend out-shouted the number. Accent when this stat drives the chart. */}
      <div aria-hidden className={cn('-mx-4 -mb-3 mt-auto h-10', selected ? 'text-link' : 'text-muted-foreground/35')}>
        {sparkPoints.length >= 2 ? (
          <Sparkline points={sparkPoints} baseline="zero" strokeWidth={1.5} {...hover.sparklineProps} />
        ) : null}
      </div>
    </button>
  )
}
