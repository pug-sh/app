import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
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
import { getSeriesColor } from '@/lib/event-colors'
import { toProtoTimeRange } from '@/lib/timestamp'
import { NUMERIC_AGGREGATIONS, VIEW_MODES, type ViewMode } from '../insights/constants'
import { InsightsContent } from '../insights/content'
import { breakdownLabel, buildChartData, disambiguateLabels, sortFunnelSteps } from '../insights/helpers'
import { BREAKDOWN_RESPONSE_LIMIT } from './constants'

const stringifyQueryKey = (value: unknown) =>
  JSON.stringify(value, (_key, nextValue) => (typeof nextValue === 'bigint' ? nextValue.toString() : nextValue))

export const DashboardInsightContent = ({
  query,
  timeRange,
  granularity,
  queryKeyPrefix,
  compact = false,
}: {
  query: QueryRequest | undefined
  timeRange: TimeRange | undefined
  granularity: Granularity
  queryKeyPrefix: string
  compact?: boolean
}) => {
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)

  const effectiveQuery = useMemo(() => {
    if (!query) return undefined
    const baseQuery = { ...query, granularity }
    if (!timeRange) return create(QueryRequestSchema, baseQuery)
    return create(QueryRequestSchema, {
      ...baseQuery,
      timeRange: create(TimeRangeSchema, toProtoTimeRange(timeRange)),
    })
  }, [granularity, query, timeRange])

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
    { enabled: !!effectiveQuery && !!headers && (effectiveQuery?.events.length ?? 0) > 0, debounceMs: 0 },
  )

  const result = data ?? { case: undefined, value: undefined }
  const trendSeries = useMemo(() => (result.case === 'trends' ? [...result.value.series] : []), [result])
  const funnelSeriesList = useMemo(() => (result.case === 'funnel' ? result.value.series : []), [result])
  const retentionSeriesList = useMemo(() => (result.case === 'retention' ? result.value.series : []), [result])
  const chartData = useMemo(() => buildChartData(trendSeries), [trendSeries])
  const kindOrder = useMemo(
    () => (effectiveQuery?.events ?? []).map(entry => entry.event?.kind ?? ''),
    [effectiveQuery?.events],
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
  const isTrends = effectiveQuery?.insightType === InsightType.TRENDS
  const isRetention = effectiveQuery?.insightType === InsightType.RETENTION
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
    () => (effectiveQuery?.events ?? []).map(entry => entry.aggregation ?? AggregationType.TOTAL),
    [effectiveQuery?.events],
  )
  const hasIncompleteNumericAggregation = useMemo(
    () =>
      (effectiveQuery?.events ?? []).some(
        entry =>
          NUMERIC_AGGREGATIONS.has(entry.aggregation ?? AggregationType.TOTAL) &&
          !(entry.aggregationProperty ?? '').trim(),
      ),
    [effectiveQuery?.events],
  )

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <InsightsContent
        error={error}
        retry={retry}
        unknownResultCase={!!result.case && !['trends', 'funnel', 'retention'].includes(result.case)}
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
        viewMode={VIEW_MODES[0]?.value ?? ('line' as ViewMode)}
        granularity={effectiveQuery?.granularity ?? granularity}
        breakdowns={(effectiveQuery?.breakdowns ?? []).map(item => item.property)}
        breakdownResponseLimit={effectiveQuery?.breakdownLimit ?? BREAKDOWN_RESPONSE_LIMIT}
        retentionSeriesList={retentionSeriesList}
        retentionLabels={retentionLabels}
        retentionCohorts={retentionCohorts}
        funnelSeriesData={funnelSeriesData}
        compact={compact}
      />
    </div>
  )
}

export const DashboardInsightPreview = ({
  query,
  timeRange,
  granularity,
}: {
  query: QueryRequest | undefined
  timeRange: TimeRange | undefined
  granularity: Granularity
}) => (
  <div className="min-h-0 rounded-lg border border-border/60 bg-background/60 p-3">
    <DashboardInsightContent
      query={query}
      timeRange={timeRange}
      granularity={granularity}
      queryKeyPrefix="editor-preview"
      compact
    />
  </div>
)
