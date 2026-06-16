import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import type { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import {
  type DashboardTile,
  DashboardTileViewMode,
  VisualizationOptions_YAxisFormat,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  type Granularity,
  InsightType,
  type QueryRequest,
  QueryRequestSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import type { TimeRange } from '@/components/date-range-picker'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { useDebouncedQuery } from '@/hooks/use-debounced-query'
import { resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { getSeriesColor } from '@/lib/event-colors'
import { toProtoTimeRange } from '@/lib/timestamp'
import { NUMERIC_AGGREGATIONS } from '../insights/constants'
import { InsightsContent } from '../insights/content'
import { breakdownLabel, buildChartData, disambiguateLabels, sortFunnelSteps } from '../insights/helpers'
import { topKSpecIncompleteReason } from '../insights/top-k'
import { buildComparisonQuery, formatComparePeriodLabel } from './compare-query'
import { BREAKDOWN_RESPONSE_LIMIT } from './constants'
import { type KpiCompare, KpiTile } from './kpi-tile'
import { getInitialGranularity, getProtoRange } from './query'
import { dashboardTileViewModeToViewMode } from './tile-settings'

export const formatYAxisValue = (format: VisualizationOptions_YAxisFormat | undefined) => {
  return (value: number): string => {
    if (!Number.isFinite(value)) return '—'
    switch (format) {
      case VisualizationOptions_YAxisFormat.PERCENT:
        return `${(value * 100).toFixed(1)}%`
      case VisualizationOptions_YAxisFormat.DURATION_MS:
        return formatDuration(value)
      case VisualizationOptions_YAxisFormat.COMPACT:
        return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
      default:
        return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
  }
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = seconds / 60
  if (minutes < 60) return `${minutes.toFixed(1)}m`
  return `${(minutes / 60).toFixed(1)}h`
}

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
  const effectiveViewMode = useMemo(() => dashboardTileViewModeToViewMode(resolvedViewMode), [resolvedViewMode])

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
  // Top-k specs carry no events, so they are runnable as soon as the ranking
  // config is complete; everything else needs at least one event.
  const isTopK = effectiveQuery?.spec?.insightType === InsightType.TOP_K
  const topKIncomplete = isTopK ? topKSpecIncompleteReason(effectiveQuery?.spec) : null
  const queryReady = isTopK ? !topKIncomplete : (effectiveQuery?.spec?.events.length ?? 0) > 0

  const { data, error, retry } = useDebouncedQuery(
    queryKey,
    async () => {
      if (!effectiveQuery) throw new Error('Missing tile query')
      const resp = await insightsRPC.query(effectiveQuery, { headers })
      return resp.result
    },
    { enabled: !!effectiveQuery && !!headers && queryReady, debounceMs: 0 },
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

  const result = data ?? { case: undefined, value: undefined }
  const comparisonResult = comparisonData ?? { case: undefined, value: undefined }
  const trendSeries = useMemo(() => (result.case === 'trends' ? [...result.value.series] : []), [result])
  const funnelSeriesList = useMemo(() => (result.case === 'funnel' ? result.value.series : []), [result])
  const retentionSeriesList = useMemo(() => (result.case === 'retention' ? result.value.series : []), [result])
  const topKRows = useMemo(() => (result.case === 'topK' ? result.value.rows : []), [result])
  const chartData = useMemo(() => buildChartData(trendSeries), [trendSeries])
  const kindOrder = useMemo(
    () => (effectiveQuery?.spec?.events ?? []).map(entry => entry.event?.kind ?? ''),
    [effectiveQuery?.spec?.events],
  )
  const funnelSeriesData = useMemo(() => {
    const labels = disambiguateLabels(
      funnelSeriesList.map((series, index) => breakdownLabel(series.breakdown, `Series ${index + 1}`)),
    )
    return funnelSeriesList.map((series, index) => ({
      label: labels[index],
      steps: sortFunnelSteps(series.steps, kindOrder),
      color: getSeriesColor(labels[index], index).dot,
    }))
  }, [funnelSeriesList, kindOrder])
  const retentionLabels = useMemo(
    () =>
      disambiguateLabels(
        retentionSeriesList.map((series, index) => breakdownLabel(series.breakdown, `Series ${index + 1}`)),
      ),
    [retentionSeriesList],
  )
  const retentionCohorts = useMemo(() => retentionSeriesList[0]?.cohorts ?? [], [retentionSeriesList])
  const isTrends = effectiveQuery?.spec?.insightType === InsightType.TRENDS
  const isRetention = effectiveQuery?.spec?.insightType === InsightType.RETENTION
  const seriesNames = useMemo(() => {
    if (result.case === 'retention') {
      return retentionCohorts.map((cohort, index) => cohort.cohort || `Cohort ${index + 1}`)
    }

    return trendSeries.map((series, index) => {
      const bd = breakdownLabel(series.breakdown, '')
      if (bd) return `${series.eventKind} · ${bd}`
      return series.eventKind || `Series ${index + 1}`
    })
  }, [result.case, retentionCohorts, trendSeries])
  const seriesColors = useMemo(() => seriesNames.map((name, index) => getSeriesColor(name, index)), [seriesNames])
  const seriesAggregations = useMemo(
    () => (effectiveQuery?.spec?.events ?? []).map(entry => entry.aggregation ?? AggregationType.TOTAL),
    [effectiveQuery?.spec?.events],
  )
  const hasIncompleteNumericAggregation = useMemo(
    () =>
      (effectiveQuery?.spec?.events ?? []).some(
        entry =>
          NUMERIC_AGGREGATIONS.has(entry.aggregation ?? AggregationType.TOTAL) &&
          !(entry.aggregationProperty ?? '').trim(),
      ),
    [effectiveQuery?.spec?.events],
  )

  // KPI tiles short-circuit the chart pipeline. Compare-vs-prior issues a second
  // query with a time range shifted back by the window's length; the delta is
  // computed inside KpiTile. Top-k results are not series-shaped, so they always
  // render through the ranked list regardless of view mode.
  if (tile && resolvedViewMode === DashboardTileViewMode.KPI && !isTopK) {
    const compareLabel = comparisonQuery ? formatComparePeriodLabel(effectiveTimeRange) : undefined
    const compare: KpiCompare | undefined = !comparisonQuery
      ? undefined
      : comparisonError
        ? { error: true, label: compareLabel ?? '' }
        : comparisonResult.case === 'trends'
          ? { series: [...comparisonResult.value.series], label: compareLabel ?? '' }
          : undefined
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <KpiTile
          tile={tile}
          currentSeries={trendSeries}
          compare={compare}
          formatValue={formatYAxisValue(tile.visualization?.yAxisFormat)}
          metadata={kpiMetadata}
          lightMetric={lightMetrics}
        />
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <InsightsContent
        error={error}
        retry={retry}
        unknownResultCase={!!result.case && !['trends', 'funnel', 'retention', 'topK'].includes(result.case)}
        resultCase={result.case}
        resultSeriesCount={
          result.case === 'trends' || result.case === 'funnel' || result.case === 'retention'
            ? result.value.series.length
            : 0
        }
        isRetention={isRetention}
        isTrends={isTrends}
        hasIncompleteNumericAggregation={hasIncompleteNumericAggregation}
        chartData={chartData}
        seriesNames={seriesNames}
        seriesColors={seriesColors}
        seriesAggregations={seriesAggregations}
        viewMode={effectiveViewMode}
        granularity={effectiveQuery?.granularity ?? effectiveGranularity}
        breakdowns={(effectiveQuery?.spec?.breakdowns ?? []).map(item => item.property)}
        breakdownResponseLimit={effectiveQuery?.spec?.breakdownLimit ?? BREAKDOWN_RESPONSE_LIMIT}
        retentionSeriesList={retentionSeriesList}
        retentionLabels={retentionLabels}
        retentionCohorts={retentionCohorts}
        funnelSeriesData={funnelSeriesData}
        isTopK={isTopK}
        topKRows={topKRows}
        topKDimension={effectiveQuery?.spec?.topK?.dimension || undefined}
        topKMetric={effectiveQuery?.spec?.topK?.metric || undefined}
        topKIncompleteReason={topKIncomplete}
        compact={compact}
        lightNumbers={lightMetrics}
      />
    </div>
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
