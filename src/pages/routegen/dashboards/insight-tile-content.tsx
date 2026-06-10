import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import type { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { type DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { type Granularity, type QueryRequest, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import type { TimeRange } from '@/components/date-range-picker'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { useDebouncedQuery } from '@/hooks/use-debounced-query'
import { resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { toProtoTimeRange } from '@/lib/timestamp'
import { buildComparisonQuery, formatComparePeriodLabel } from './compare-query'
import { InsightTileView } from './insight-tile-view'
import type { KpiCompare } from './kpi-tile'
import { getInitialGranularity, getProtoRange, specHasIncompleteNumericAggregation } from './query'

export { formatYAxisValue } from './insight-tile-view'

const stringifyQueryKey = (value: unknown) =>
  JSON.stringify(value, (_key, nextValue) => (typeof nextValue === 'bigint' ? nextValue.toString() : nextValue))

export const DashboardInsightContent = ({
  tile,
  viewMode,
  query,
  defaultTimeRange,
  timeRangeOverride,
  granularityOverride,
  queryKeyPrefix,
  compact = false,
}: {
  // Pass either a full DashboardTile (for dashboard pages, where threshold + compare
  // + viz options apply) or just a viewMode (for overview/static tiles).
  tile?: DashboardTile
  viewMode?: DashboardTileViewMode
  query: QueryRequest | undefined
  defaultTimeRange: TimeRangePreset | undefined
  timeRangeOverride?: TimeRange
  granularityOverride?: Granularity
  queryKeyPrefix: string
  compact?: boolean
}) => {
  const resolvedViewMode = tile?.viewMode ?? viewMode
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  // Key the memo on the embedded range's *content* (primitive millis), not on `query`'s
  // identity. Callers rebuild `query` inline each render; keying on identity re-ran the
  // preset resolver → new Date() every render, advancing timeRange.to → the stringified
  // queryKey changed → useDebouncedQuery refetched in an infinite loop.
  const embeddedRange = query ? getProtoRange(query.timeRange) : undefined
  const embeddedFromMs = embeddedRange?.from.getTime()
  const embeddedToMs = embeddedRange?.to.getTime()
  const effectiveTimeRange = useMemo(
    () =>
      timeRangeOverride ??
      resolveDashboardTimeRangePreset(
        defaultTimeRange,
        embeddedFromMs !== undefined && embeddedToMs !== undefined
          ? { from: new Date(embeddedFromMs), to: new Date(embeddedToMs) }
          : undefined,
      ),
    [defaultTimeRange, timeRangeOverride, embeddedFromMs, embeddedToMs],
  )
  const effectiveGranularity = useMemo(
    () => granularityOverride ?? getInitialGranularity(query),
    [granularityOverride, query],
  )

  const effectiveQuery = useMemo(() => {
    if (!query) return undefined
    return create(QueryRequestSchema, {
      ...query,
      granularity: effectiveGranularity,
      timeRange: create(TimeRangeSchema, toProtoTimeRange(effectiveTimeRange)),
    })
  }, [effectiveGranularity, effectiveTimeRange, query])

  const projectId = headers?.['x-project-id'] ?? ''
  const queryKey = stringifyQueryKey({
    prefix: queryKeyPrefix,
    projectId,
    query: effectiveQuery,
  })
  const { data, error, retry } = useDebouncedQuery(
    queryKey,
    async () => {
      if (!effectiveQuery) throw new Error('Missing tile query')
      const resp = await insightsRPC.query(effectiveQuery, { headers })
      return resp.result
    },
    {
      enabled:
        !!effectiveQuery &&
        !!headers &&
        (effectiveQuery?.spec?.events.length ?? 0) > 0 &&
        !specHasIncompleteNumericAggregation(effectiveQuery?.spec),
      debounceMs: 0,
    },
  )

  const comparisonQuery = useMemo(
    () => (tile ? buildComparisonQuery(effectiveQuery, effectiveTimeRange, tile.compare) : undefined),
    [effectiveQuery, effectiveTimeRange, tile],
  )
  const comparisonQueryKey = stringifyQueryKey({
    prefix: `${queryKeyPrefix}::compare`,
    projectId,
    query: comparisonQuery,
  })
  const { data: comparisonData, error: comparisonError } = useDebouncedQuery(
    comparisonQueryKey,
    async () => {
      if (!comparisonQuery) throw new Error('Missing comparison query')
      const resp = await insightsRPC.query(comparisonQuery, { headers })
      return resp.result
    },
    { enabled: !!comparisonQuery && !!headers, debounceMs: 0 },
  )

  const comparisonResult = comparisonData ?? { case: undefined, value: undefined }

  // Compare-vs-prior issues a second query shifted back by the window length; the
  // delta is computed inside KpiTile. Only assembled for KPI tiles.
  const compare = useMemo<KpiCompare | undefined>(() => {
    if (!(tile && resolvedViewMode === DashboardTileViewMode.KPI) || !comparisonQuery) return undefined
    const compareLabel = formatComparePeriodLabel(effectiveTimeRange)
    if (comparisonError) return { error: true, label: compareLabel ?? '' }
    if (comparisonResult.case === 'trends')
      return { series: [...comparisonResult.value.series], label: compareLabel ?? '' }
    return undefined
  }, [tile, resolvedViewMode, comparisonQuery, comparisonError, comparisonResult, effectiveTimeRange])

  return (
    <InsightTileView
      tile={tile}
      viewMode={viewMode}
      spec={effectiveQuery?.spec}
      result={data ?? { case: undefined, value: undefined }}
      granularity={effectiveQuery?.granularity ?? effectiveGranularity}
      error={error}
      onRetry={retry}
      compare={compare}
      compact={compact}
    />
  )
}

export const DashboardInsightPreview = ({
  tile,
  viewMode,
  query,
  defaultTimeRange,
}: {
  tile?: DashboardTile
  viewMode?: DashboardTileViewMode
  query: QueryRequest | undefined
  defaultTimeRange: TimeRangePreset | undefined
}) => (
  <div className="h-80 min-h-0 overflow-hidden rounded-lg border border-border/60 bg-background/60 p-3">
    <DashboardInsightContent
      tile={tile}
      viewMode={viewMode}
      query={query}
      defaultTimeRange={defaultTimeRange}
      queryKeyPrefix="editor-preview"
      compact
    />
  </div>
)
