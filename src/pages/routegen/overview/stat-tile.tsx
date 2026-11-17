import { timestampDate } from '@bufbuild/protobuf/wkt'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import type { Granularity, QueryRequest } from '@/api/genproto/shared/insights/v1/insights_pb'
import { useSparklineHover } from '@/components/charts/sparkline'
import type { TimeRange } from '@/components/date-range-picker'
import { Button } from '@/components/ui/button'
import { activeProjectTimezoneAtom } from '@/data/workspace.atoms'
import { alignRangeStart } from '@/lib/granularity'
import { cn } from '@/lib/utils'
import { priorPeriodRange } from '../dashboards/compare-query'
import { DeltaBadge, formatDelta, Sparkline } from '../dashboards/kpi-tile'
import { formatTooltipDate } from '../insights/charts/helpers'
import { buildChartData } from '../insights/helpers'
import { useTrafficQuery } from './use-traffic-query'

export const StatTile = ({
  label,
  description,
  scalarQuery,
  trendQuery,
  formatValue,
  lowerIsBetter,
  selected,
  onSelect,
  range,
  granularity,
  queryKeyPrefix,
}: {
  label: string
  description?: string
  // SEGMENTATION for the headline and TRENDS for the sparkline, over the same measure and filters.
  scalarQuery: QueryRequest
  trendQuery: QueryRequest
  formatValue: (value: number) => string
  lowerIsBetter?: boolean
  selected: boolean
  onSelect: () => void
  range: TimeRange
  granularity: Granularity
  queryKeyPrefix: string
}) => {
  const timeZone = useAtomValue(activeProjectTimezoneAtom)
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

  const { result, error, retry, loading } = useTrafficQuery(scalarQuery, range, granularity, queryKeyPrefix)
  const {
    result: priorResult,
    error: priorError,
    retry: retryPrior,
    loading: priorLoading,
  } = useTrafficQuery(scalarQuery, priorRange, granularity, `${queryKeyPrefix}-prev`, false)
  const {
    answered: trend,
    error: trendError,
    retry: retryTrend,
  } = useTrafficQuery(trendQuery, range, granularity, `${queryKeyPrefix}-spark`)
  const hover = useSparklineHover()

  // Trends drop empty buckets: a count's are real zeros, gridded like the charts, but an average's have no value.
  const sparkPoints = useMemo(() => {
    if (trend?.result.case !== 'trends') return []
    const series = trend.result.value.series.slice(0, 1)
    if (trend.fillRange) return buildChartData(series, trend.granularity, timeZone, trend.fillRange)
    return (series[0]?.points ?? []).flatMap(point =>
      point.time ? [{ date: timestampDate(point.time), values: [point.value] }] : [],
    )
  }, [trend, timeZone])
  const sparkValues = useMemo(() => sparkPoints.map(point => ({ value: point.values[0] })), [sparkPoints])

  // A bare '–' would read as an empty window. A <div>, since Retry can't nest in the tile's <button>; it re-runs
  // all three queries, which fail together.
  const failed = error ?? priorError ?? trendError
  if (failed) {
    return (
      <div className="flex h-[9.25rem] min-h-0 flex-col rounded-lg border border-border bg-background px-4 py-3 text-left dark:border-foreground/15">
        <span className="truncate text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2">
          <span className="text-xs text-muted-foreground" title={failed}>
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
  // Both windows reload on a new range, and either can land first: a delta waits for the pair.
  const settled = !loading && !priorLoading
  const delta = settled && value !== undefined && priorValue !== undefined ? formatDelta(value, priorValue) : null
  const hovered = hover.index !== null ? sparkPoints[hover.index] : undefined
  const shown = hovered?.values[0] ?? value

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={description}
      className={cn(
        'flex h-[9.25rem] min-h-0 flex-col overflow-hidden rounded-lg border px-4 py-3 text-left transition-colors',
        selected
          ? 'border-chart-1/50 bg-background'
          : 'border-border bg-background dark:border-foreground/15 dark:hover:border-foreground/25',
      )}
    >
      <span className="truncate text-sm font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          'mt-1 text-4xl tracking-tight tabular-nums',
          loading && value === undefined && 'animate-pulse opacity-40',
        )}
      >
        {shown !== undefined ? formatValue(shown) : '–'}
      </span>
      <div className="mt-1 flex h-5 items-center">
        {hovered && trend ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatTooltipDate(hovered.date, trend.granularity, timeZone)}
          </span>
        ) : (
          delta && <DeltaBadge pct={delta.pct} label={delta.label} lowerIsBetter={lowerIsBetter} />
        )}
      </div>

      {/* Fixed shallow band pinned to the bottom edge: given the full leftover height the vertical stretch
          exaggerated every wiggle and the trend out-shouted the number. */}
      <div
        aria-hidden
        className={cn('-mx-4 -mb-3 mt-auto h-10', selected ? 'text-chart-1' : 'text-muted-foreground/35')}
      >
        {sparkValues.length >= 2 ? (
          <Sparkline points={sparkValues} baseline="zero" strokeWidth={1.5} {...hover.sparklineProps} />
        ) : null}
      </div>
    </button>
  )
}
