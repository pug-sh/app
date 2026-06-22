import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import type { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { type DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  type Granularity,
  InsightType,
  type QueryRequest,
  QueryRequestSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import type { TimeRange } from '@/components/date-range-picker'
import { activeProjectTimezoneAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { stringifyQueryKey, useDebouncedQuery } from '@/hooks/use-debounced-query'
import { resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { toProtoTimeRange } from '@/lib/timestamp'
import { floorToZoneBucket } from '@/lib/timezone'
import { topKSpecIncompleteReason } from '../insights/top-k'
import { isUserFlowConfigValid, parseUserFlowConfig } from '../insights/user-flow'
import { buildComparisonQuery, formatComparePeriodLabel } from './compare-query'
import { InsightTileView } from './insight-tile-view'
import type { KpiCompare } from './kpi-tile'
import { getInitialGranularity, getProtoRange, specHasIncompleteNumericAggregation } from './query'

// User-flow and top-k specs carry no events: user-flow runs once its flow config is
// valid, top-k as soon as the ranking config is complete. Everything else needs at
// least one event and (for trends) a resolved numeric-aggregation property.
const queryReady = (query: QueryRequest) => {
  const spec = query.spec
  if (spec?.insightType === InsightType.USER_FLOW) {
    return isUserFlowConfigValid(parseUserFlowConfig(spec.userFlow))
  }
  if (spec?.insightType === InsightType.TOP_K) {
    return !topKSpecIncompleteReason(spec)
  }
  return (spec?.events.length ?? 0) > 0 && !specHasIncompleteNumericAggregation(spec)
}

export const DashboardInsightContent = ({
  tile,
  viewMode,
  query,
  defaultTimeRange,
  timeRangeOverride,
  granularityOverride,
  queryKeyPrefix,
  compact = false,
  kpiMetadata,
  lightMetrics = false,
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
  kpiMetadata?: string
  lightMetrics?: boolean
}) => {
  const resolvedViewMode = tile?.viewMode ?? viewMode
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const timeZone = useAtomValue(activeProjectTimezoneAtom)
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
    // Floor `from` to the bucket boundary in the project zone so the first bucket is
    // complete — otherwise a mid-bucket window start renders as a partial "dip" at the
    // chart's left edge (the server buckets in this same zone).
    const from = floorToZoneBucket(effectiveTimeRange.from, effectiveGranularity, timeZone)
    return create(QueryRequestSchema, {
      ...query,
      granularity: effectiveGranularity,
      timeRange: create(TimeRangeSchema, toProtoTimeRange({ from, to: effectiveTimeRange.to })),
    })
  }, [effectiveGranularity, effectiveTimeRange, query, timeZone])

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
    { enabled: !!effectiveQuery && !!headers && queryReady(effectiveQuery), debounceMs: 0 },
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
      kpiMetadata={kpiMetadata}
      lightMetrics={lightMetrics}
    />
  )
}
