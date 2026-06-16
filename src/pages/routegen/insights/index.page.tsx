import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { BarChart3, CircleHelp, Clock, Loader2, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import { AggregationType, Granularity, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import { BreakdownBuilder, BreakdownChip, EventFilterBar, FilterBuilder, FilterChip } from '@/components/event-filters'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import Page from '@/components/layout/page'
import NoProject from '@/components/no-project'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useDebouncedQuery } from '@/hooks/use-debounced-query'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { useEventFilters } from '@/hooks/use-event-filters'
import {
  BREAKDOWN_MAX,
  BREAKDOWN_RESPONSE_LIMIT,
  readFilterQueryParams,
  writeFilterQueryParams,
} from '@/hooks/use-filter-query-params'
import { useFilterState } from '@/hooks/use-filter-state'
import { useGlobalFilterSchema } from '@/hooks/use-global-filter-schema'
import { INSIGHTS_PRESETS } from '@/lib/date-presets'
import { getSeriesColor } from '@/lib/event-colors'
import { clampGranularity, granularityDisabledReason } from '@/lib/granularity'
import { toProtoTimeRange } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../events/filter-schema.atoms'
import type { ChartPoint } from './charts'
import {
  EMPTY_ARRAY,
  EMPTY_RESULT,
  GRANULARITIES,
  GRANULARITY_VALUES,
  getPageDescription,
  INSIGHT_TYPE_VALUES,
  INSIGHT_TYPES,
  NUMERIC_AGGREGATIONS,
  VIEW_MODES,
  type ViewMode,
} from './constants'
import { InsightsContent } from './content'
import { InsightsRowAggregationControls, OptionChip } from './controls'
import { breakdownLabel, buildChartData, disambiguateLabels, sortFunnelSteps } from './helpers'
import { buildUserFlowQuery, DEFAULT_USER_FLOW_CONFIG, isUserFlowConfigValid, type UserFlowConfig } from './user-flow'
import { UserFlowControls } from './user-flow-controls'

const getInitialInsightType = (initialInsightType: InsightType | undefined) => {
  if (initialInsightType !== undefined && INSIGHT_TYPE_VALUES.includes(initialInsightType)) {
    return initialInsightType
  }
  return InsightType.TRENDS
}

const getInitialGranularity = (initialGranularity: Granularity | undefined) => {
  if (initialGranularity !== undefined && GRANULARITY_VALUES.includes(initialGranularity)) {
    return initialGranularity
  }
  return Granularity.DAY
}

const getAggregationProperty = ({
  insightType,
  aggregation,
  aggregationProperty,
}: {
  insightType: InsightType
  aggregation: AggregationType | undefined
  aggregationProperty: string | undefined
}) => {
  if (insightType !== InsightType.TRENDS) return ''
  if (!NUMERIC_AGGREGATIONS.has(aggregation ?? AggregationType.TOTAL)) return ''
  return aggregationProperty ?? ''
}

const Insights = () => {
  // Project and RPC context.
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)
  const initialFilterState = useMemo(() => readFilterQueryParams(), [])

  useEffect(() => {
    if (initialFilterState.parseWarning) {
      toast.warning(initialFilterState.parseWarning, { id: 'filter-parse-warning' })
    }
  }, [])

  // Local query state.
  const eventFilters = useEventFilters(initialFilterState.eventFilters)
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(
    () => initialFilterState.timeRange ?? INSIGHTS_PRESETS[0].resolve(),
  )
  const [insightType, setInsightType] = useState(() => getInitialInsightType(initialFilterState.insightType))
  const [granularity, setGranularity] = useState(() => getInitialGranularity(initialFilterState.granularity))
  const [viewMode, setViewMode] = useState<ViewMode>('line')
  const [userFlowConfig, setUserFlowConfig] = useState<UserFlowConfig>(
    () => initialFilterState.userFlowConfig ?? DEFAULT_USER_FLOW_CONFIG,
  )
  const { propFilters, addFilter, updateFilter, removeFilter } = useFilterState(initialFilterState.propFilters)
  const [breakdowns, setBreakdowns] = useState(() => initialFilterState.breakdowns)

  const addBreakdown = useCallback((prop: string) => {
    setBreakdowns(prev => {
      if (prev.includes(prop) || prev.length >= BREAKDOWN_MAX) return prev
      return [...prev, prop]
    })
  }, [])

  const removeBreakdown = useCallback((prop: string) => {
    setBreakdowns(prev => prev.filter(p => p !== prop))
  }, [])

  const isUserFlow = insightType === InsightType.USER_FLOW

  // Keep granularity valid for the range: a too-fine granularity (e.g. Hour over 30 days)
  // would be rejected by the backend, so bump it to the finest that still fits.
  const handleTimeRangeChange = useCallback((range: TimeRange | undefined) => {
    setTimeRange(range)
    setGranularity(g => clampGranularity(g, range))
  }, [])

  // Schema loading and URL sync.
  const store = useStore()
  const { filtersAtom, reset: resetFilters } = eventFilters

  useEffect(() => {
    if (insightType !== InsightType.RETENTION) return
    const entries = store.get(filtersAtom)
    if (entries.length <= 2) return
    resetFilters(entries.slice(0, 2))
  }, [insightType, store, filtersAtom, resetFilters])

  const { schema: globalSchema, schemaError: globalSchemaError } = useGlobalFilterSchema({
    baseSchema: schema,
    baseSchemaError: schemaError,
    selectedEventKinds: isUserFlow
      ? userFlowConfig.scope.kind
        ? [userFlowConfig.scope.kind]
        : []
      : eventFilters.entries.map(e => e.kind),
  })

  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  useEffect(() => {
    writeFilterQueryParams(eventFilters.entries, propFilters, {
      insightType,
      granularity,
      timeRange,
      breakdowns,
      userFlowConfig: isUserFlow ? userFlowConfig : undefined,
    })
  }, [eventFilters.entries, propFilters, insightType, granularity, timeRange, breakdowns, userFlowConfig, isUserFlow])

  // Derived query config.
  const validEntries = eventFilters.validEntries
  const isTrends = insightType === InsightType.TRENDS
  const isRetention = insightType === InsightType.RETENTION
  const isTimeSeriesInsight = isTrends || isRetention
  const userFlowReady = isUserFlowConfigValid(userFlowConfig)
  const stickyClassName = isRetention ? 'relative z-auto' : 'sticky top-0 z-10'
  const maxEvents = isRetention ? 2 : undefined

  const hasIncompleteNumericAggregation = useMemo(
    () =>
      insightType === InsightType.TRENDS &&
      validEntries.some(
        entry =>
          NUMERIC_AGGREGATIONS.has(entry.aggregation ?? AggregationType.TOTAL) &&
          !(entry.aggregationProperty ?? '').trim(),
      ),
    [insightType, validEntries],
  )

  const queryKey = JSON.stringify({
    entries: eventFilters.entries,
    timeRange,
    insightType,
    granularity,
    propFilters,
    breakdowns,
    userFlowConfig,
  })

  // Remote query execution.
  const {
    data: queryResult,
    loading,
    error,
    retry,
  } = useDebouncedQuery(
    queryKey,
    async () => {
      const globalFilters = toProtoFilters(propFilters)
      const filterGroups = globalFilters.length > 0 ? [{ filters: globalFilters, operator: LogicalOperator.AND }] : []
      const resp = await insightsRPC.query(
        {
          granularity,
          timeRange: toProtoTimeRange(timeRange),
          spec: {
            insightType,
            events: isUserFlow
              ? []
              : validEntries.map(entry => ({
                  event: {
                    kind: entry.kind,
                    filters: toProtoFilters(entry.filters),
                  },
                  aggregation:
                    insightType === InsightType.TRENDS
                      ? (entry.aggregation ?? AggregationType.TOTAL)
                      : AggregationType.TOTAL,
                  aggregationProperty: getAggregationProperty({
                    insightType,
                    aggregation: entry.aggregation,
                    aggregationProperty: entry.aggregationProperty,
                  }),
                })),
            userFlow: isUserFlow ? buildUserFlowQuery(userFlowConfig) : undefined,
            filterGroups,
            filterGroupsOperator: LogicalOperator.AND,
            breakdowns: isUserFlow ? [] : breakdowns.map(property => ({ property })),
            breakdownLimit: isUserFlow || breakdowns.length === 0 ? 0 : BREAKDOWN_RESPONSE_LIMIT,
          },
        },
        { headers },
      )
      return resp.result
    },
    {
      enabled:
        !!project &&
        !!timeRange &&
        !hasIncompleteNumericAggregation &&
        (isUserFlow ? userFlowReady : validEntries.length > 0),
    },
  )

  // Result normalization.
  const result = queryResult ?? EMPTY_RESULT
  const unknownResultCase =
    result.case !== undefined &&
    result.case !== 'trends' &&
    result.case !== 'funnel' &&
    result.case !== 'retention' &&
    result.case !== 'userFlow'
  let resultSeriesCount = 0
  if (result.case === 'trends' || result.case === 'funnel' || result.case === 'retention') {
    resultSeriesCount = result.value.series.length
  }

  useEffect(() => {
    if (unknownResultCase) console.warn('Unrecognized insight result case:', result.case)
  }, [unknownResultCase, result.case])

  const trendSeries = useMemo(() => {
    if (result.case !== 'trends') return EMPTY_ARRAY
    return [...result.value.series].sort((a, b) => {
      const ai = validEntries.findIndex(e => e.kind === a.eventKind)
      const bi = validEntries.findIndex(e => e.kind === b.eventKind)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [result, validEntries])

  const emptySeriesResult =
    (result.case === 'retention' || result.case === 'funnel') && result.value.series.length === 0

  useEffect(() => {
    if (emptySeriesResult) console.warn('Empty series in result — expected at least one')
  }, [emptySeriesResult])

  // Chart and table data shaping.
  const retentionSeriesList = useMemo(() => {
    if (result.case !== 'retention') return EMPTY_ARRAY
    return result.value.series
  }, [result])

  const retentionCohorts = useMemo(() => retentionSeriesList[0]?.cohorts ?? EMPTY_ARRAY, [retentionSeriesList])
  const kindOrder = useMemo(() => validEntries.map(e => e.kind), [validEntries])

  const funnelSeriesList = useMemo(() => {
    if (result.case !== 'funnel') return EMPTY_ARRAY
    return result.value.series
  }, [result])

  const funnelSeriesData = useMemo(() => {
    const labels = disambiguateLabels(funnelSeriesList.map((s, si) => breakdownLabel(s.breakdown, `Series ${si + 1}`)))
    return funnelSeriesList.map((series, si) => ({
      label: labels[si],
      steps: sortFunnelSteps(series.steps, kindOrder),
      color: getSeriesColor(labels[si], si).dot,
    }))
  }, [funnelSeriesList, kindOrder])

  const retentionLabels = useMemo(
    () => disambiguateLabels(retentionSeriesList.map((s, si) => breakdownLabel(s.breakdown, `Series ${si + 1}`))),
    [retentionSeriesList],
  )

  const seriesNames = useMemo(() => {
    if (result.case === 'retention') {
      return retentionCohorts.map((c, i) => c.cohort || `Cohort ${i + 1}`)
    }

    return trendSeries.map((s, i) => {
      const bd = breakdownLabel(s.breakdown, '')
      if (bd) return `${s.eventKind} · ${bd}`
      return s.eventKind || `Series ${i + 1}`
    })
  }, [result.case, retentionCohorts, trendSeries])

  const seriesColors = useMemo(() => seriesNames.map((name, i) => getSeriesColor(name, i)), [seriesNames])

  const seriesAggregations = useMemo(() => {
    if (result.case !== 'trends') return []

    return trendSeries.map(series => {
      const entry = validEntries.find(candidate => candidate.kind === series.eventKind)
      return entry?.aggregation ?? AggregationType.TOTAL
    })
  }, [result.case, trendSeries, validEntries])
  const eventFilterColors = useMemo(
    () => eventFilters.entries.map((entry, i) => getSeriesColor(entry.kind || `step ${i + 1}`, i)),
    [eventFilters.entries],
  )
  const chartData = useMemo<ChartPoint[]>(() => buildChartData(trendSeries), [trendSeries])
  const userFlowResult = useMemo(() => (result.case === 'userFlow' ? result.value : undefined), [result])

  // Render helpers.
  const getEventColorDot = useCallback((eventName: string) => getSeriesColor(eventName).dot, [])

  const renderRowExtra = useMemo(() => {
    if (!isTrends) return undefined

    return (entry: EventFilterEntry, rowSchema: GetFilterSchemaResponse | null, rowSchemaError: string | null) => (
      <InsightsRowAggregationControls
        entry={entry}
        rowSchema={rowSchema}
        rowSchemaError={rowSchemaError}
        filtersAtom={eventFilters.filtersAtom}
        setAggregation={eventFilters.setAggregation}
        setAggregationProperty={eventFilters.setAggregationProperty}
      />
    )
  }, [eventFilters.filtersAtom, eventFilters.setAggregation, eventFilters.setAggregationProperty, isTrends])

  // Page render.
  if (!project) return <NoProject title="Insights" icon={TrendingUp} />

  return (
    <Page title="Insights" description={getPageDescription(insightType)}>
      <div
        className={cn(
          '-mx-8 px-8 space-y-2 border-b border-border/50 bg-background -mt-4 pt-1 pb-2 mb-4',
          stickyClassName,
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={timeRange} onChange={handleTimeRangeChange} presets={INSIGHTS_PRESETS} />
          <OptionChip label="insight" options={INSIGHT_TYPES} value={insightType} onChange={setInsightType} />
          {isTimeSeriesInsight && (
            <>
              <OptionChip
                label="granularity"
                icon={Clock}
                options={GRANULARITIES}
                value={granularity}
                onChange={setGranularity}
                isOptionDisabled={v => granularityDisabledReason(v, timeRange)}
              />
              {isTrends && (
                <OptionChip
                  label="view"
                  icon={BarChart3}
                  options={VIEW_MODES}
                  value={viewMode}
                  onChange={setViewMode}
                />
              )}
            </>
          )}
        </div>

        <div className="space-y-1">
          {isUserFlow ? (
            <UserFlowControls
              config={userFlowConfig}
              onChange={setUserFlowConfig}
              schema={schema}
              schemaError={schemaError}
              events={schema?.events}
            />
          ) : (
            <>
              <EventFilterBar
                filtersAtom={eventFilters.filtersAtom}
                events={schema?.events}
                schema={schema}
                schemaError={schemaError}
                showLetters
                seriesColors={eventFilterColors}
                getEventColor={getEventColorDot}
                renderRowExtra={renderRowExtra}
                maxEvents={maxEvents}
              />
              {isRetention && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger className="inline-flex items-center cursor-help">
                      <CircleHelp className="w-3.5 h-3.5" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="max-w-xs text-xs">
                      Use up to two events: A defines the cohort entry event, B defines the return event. If B is
                      omitted, A is used for both cohort and return.
                    </TooltipContent>
                  </Tooltip>
                  <span>Retention supports up to 2 events (A = cohort, B = return).</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {propFilters.map((f, i) => (
            <FilterChip
              key={`f-${i}`}
              filter={f}
              onRemove={() => removeFilter(i)}
              onUpdate={next => updateFilter(i, next)}
            />
          ))}
          <FilterBuilder schema={globalSchema} schemaError={globalSchemaError} onAdd={addFilter} />
          {!isUserFlow && (propFilters.length > 0 || breakdowns.length > 0) && (
            <span className="h-4 w-px bg-border mx-0.5" />
          )}
          {!isUserFlow &&
            breakdowns.map(prop => <BreakdownChip key={prop} property={prop} onRemove={() => removeBreakdown(prop)} />)}
          {!isUserFlow && (
            <BreakdownBuilder
              schema={globalSchema}
              schemaError={globalSchemaError}
              breakdowns={breakdowns}
              onAdd={addBreakdown}
              onRemove={removeBreakdown}
              disabled={
                breakdowns.length >= BREAKDOWN_MAX ? { reason: `Up to ${BREAKDOWN_MAX} breakdowns` } : undefined
              }
            />
          )}
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-1" />}
        </div>
      </div>

      <InsightsContent
        error={error}
        retry={retry}
        unknownResultCase={unknownResultCase}
        resultCase={result.case}
        resultSeriesCount={resultSeriesCount}
        isRetention={isRetention}
        isTrends={isTrends}
        isUserFlow={isUserFlow}
        hasIncompleteNumericAggregation={hasIncompleteNumericAggregation}
        chartData={chartData}
        seriesNames={seriesNames}
        seriesColors={seriesColors}
        seriesAggregations={seriesAggregations}
        viewMode={viewMode}
        granularity={granularity}
        breakdowns={breakdowns}
        breakdownResponseLimit={BREAKDOWN_RESPONSE_LIMIT}
        retentionSeriesList={retentionSeriesList}
        retentionLabels={retentionLabels}
        retentionCohorts={retentionCohorts}
        funnelSeriesData={funnelSeriesData}
        userFlowResult={userFlowResult}
        userFlowGroupBy={userFlowConfig.groupBy}
      />
    </Page>
  )
}

export default Insights
