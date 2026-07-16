import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { BarChart3, CircleHelp, Clock, Loader2, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { trackEvent } from '@/analytics/pug'
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
import { resolvedThemeAtom } from '@/data/theme.atoms'
import { activeProjectAtom, activeProjectTimezoneAtom, projectHeaderAtom } from '@/data/workspace.atoms'
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
import { getIndexedColor, getSeriesColor } from '@/lib/event-colors'
import { clampGranularity, clampRange, granularityDisabledReason } from '@/lib/granularity'
import { toProtoTimeRange } from '@/lib/timestamp'
import { floorToZoneBucket } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../events/filter-schema.atoms'
import type { ChartPoint } from './charts'
import {
  EMPTY_ARRAY,
  EMPTY_RESULT,
  eventEntryCap,
  GRANULARITIES,
  GRANULARITY_VALUES,
  getPageDescription,
  INSIGHT_TYPE_VALUES,
  INSIGHT_TYPES,
  isIncompleteNumericAggregation,
  NUMERIC_AGGREGATIONS,
  VIEW_MODES,
  type ViewMode,
} from './constants'
import { InsightsContent } from './content'
import { InsightsRowAggregationControls, OptionChip } from './controls'
import {
  breakdownLabel,
  buildChartData,
  disambiguateLabels,
  hasBreakdown,
  sortFunnelSteps,
  trendSeriesNames,
} from './helpers'
import { buildTopKQuery, DEFAULT_TOP_K, topKIncompleteReason } from './top-k'
import { TopKControls } from './top-k-controls'

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
  const reportingTimeZone = useAtomValue(activeProjectTimezoneAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)
  // Series colors are theme-adapted (see event-colors.ts). Subscribe so a theme
  // toggle re-renders and re-derives the memoized palettes below.
  const resolvedTheme = useAtomValue(resolvedThemeAtom)
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
  const { propFilters, addFilter, updateFilter, removeFilter } = useFilterState(initialFilterState.propFilters)
  const [breakdowns, setBreakdowns] = useState(() => initialFilterState.breakdowns)
  const [topK, setTopK] = useState(() => initialFilterState.topK ?? DEFAULT_TOP_K)

  const addBreakdown = useCallback((prop: string) => {
    setBreakdowns(prev => {
      if (prev.includes(prop) || prev.length >= BREAKDOWN_MAX) return prev
      return [...prev, prop]
    })
  }, [])

  const removeBreakdown = useCallback((prop: string) => {
    setBreakdowns(prev => prev.filter(p => p !== prop))
  }, [])

  // Keep range and granularity backend-valid: cap a range too wide for any granularity to the
  // supported max, then bump a too-fine granularity (e.g. Hour over 30 days) to the finest that
  // still fits — both combinations would otherwise be rejected by the backend.
  const handleTimeRangeChange = useCallback((range: TimeRange | undefined) => {
    const clamped = clampRange(range)
    setTimeRange(clamped)
    setGranularity(g => clampGranularity(g, clamped))
  }, [])

  // Schema loading and URL sync.
  const store = useStore()
  const { filtersAtom, reset: resetFilters } = eventFilters

  // Truncate leftover event rows when switching to an insight type with a smaller
  // event cap (retention = 2, top-k = 1). See eventEntryCap.
  useEffect(() => {
    const cap = eventEntryCap(insightType)
    if (cap === undefined) return
    const entries = store.get(filtersAtom)
    if (entries.length <= cap) return
    resetFilters(entries.slice(0, cap))
  }, [insightType, store, filtersAtom, resetFilters])

  const { schema: globalSchema, schemaError: globalSchemaError } = useGlobalFilterSchema({
    baseSchema: schema,
    baseSchemaError: schemaError,
    selectedEventKinds: eventFilters.entries.map(e => e.kind),
  })

  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  // Derived query config.
  const validEntries = eventFilters.validEntries
  const isTrends = insightType === InsightType.TRENDS
  const isRetention = insightType === InsightType.RETENTION
  const isTopK = insightType === InsightType.TOP_K
  const isTimeSeriesInsight = isTrends || isRetention
  const stickyClassName = isRetention ? 'relative z-auto' : 'sticky top-0 z-10'
  const maxEvents = eventEntryCap(insightType)

  useEffect(() => {
    writeFilterQueryParams(eventFilters.entries, propFilters, {
      insightType,
      granularity,
      timeRange,
      breakdowns,
      topK: isTopK ? topK : undefined,
    })
  }, [eventFilters.entries, propFilters, insightType, granularity, timeRange, breakdowns, isTopK, topK])

  const hasIncompleteNumericAggregation = useMemo(
    () =>
      insightType === InsightType.TRENDS &&
      validEntries.some(entry => isIncompleteNumericAggregation(entry.aggregation, entry.aggregationProperty)),
    [insightType, validEntries],
  )

  const topKIncomplete = isTopK ? topKIncompleteReason(topK) : null

  const queryKey = JSON.stringify({
    entries: eventFilters.entries,
    timeRange,
    insightType,
    granularity,
    propFilters,
    breakdowns,
    topK: isTopK ? topK : undefined,
    // The query's floored `from` depends on the project zone, so a zone change must refetch.
    reportingTimeZone,
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
      // Top-k specs carry no events/breakdowns (the backend rejects them); the
      // scope event rides inside topK instead.
      const spec = isTopK
        ? {
            insightType,
            filterGroups,
            filterGroupsOperator: LogicalOperator.AND,
            topK: buildTopKQuery(topK, validEntries[0]),
          }
        : {
            insightType,
            events: validEntries.map(entry => ({
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
            filterGroups,
            filterGroupsOperator: LogicalOperator.AND,
            breakdowns: breakdowns.map(property => ({ property })),
            breakdownLimit: breakdowns.length > 0 ? BREAKDOWN_RESPONSE_LIMIT : 0,
          }
      const resp = await insightsRPC.query(
        {
          granularity,
          // Floor `from` to the project-zone bucket boundary so the first bucket is
          // complete (avoids the partial-bucket "dip" at the chart's left edge).
          timeRange: toProtoTimeRange(
            timeRange
              ? { from: floorToZoneBucket(timeRange.from, granularity, reportingTimeZone), to: timeRange.to }
              : undefined,
          ),
          spec,
        },
        { headers },
      )
      // One event per settled query: useDebouncedQuery re-runs this fn only when queryKey changes,
      // and the 300ms debounce collapses keystrokes — so no dedup is needed here. Shape only, never
      // filter values: insightType/counts answer "what kinds of insights get run, how complex"
      // without carrying a customer's property values (which is why $url drops the query string).
      trackEvent('insight_queried', {
        insightType: InsightType[insightType]?.toLowerCase() ?? 'unknown',
        eventCount: isTopK ? 1 : validEntries.length,
        breakdownCount: breakdowns.length,
        hasGlobalFilters: globalFilters.length > 0,
      })
      return resp.result
    },
    {
      enabled:
        !!project &&
        !!timeRange &&
        (isTopK ? !topKIncomplete : validEntries.length > 0 && !hasIncompleteNumericAggregation),
    },
  )

  // Result normalization.
  const result = queryResult ?? EMPTY_RESULT
  const unknownResultCase =
    result.case !== undefined &&
    result.case !== 'trends' &&
    result.case !== 'funnel' &&
    result.case !== 'retention' &&
    result.case !== 'topK'
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

  const topKRows = useMemo(() => {
    if (result.case !== 'topK') return EMPTY_ARRAY
    return result.value.rows
  }, [result])

  const funnelSeriesData = useMemo(() => {
    const labels = disambiguateLabels(funnelSeriesList.map((s, si) => breakdownLabel(s.breakdown, `Series ${si + 1}`)))
    return funnelSeriesList.map((series, si) => ({
      label: labels[si],
      steps: sortFunnelSteps(series.steps, kindOrder),
      // Breakdown funnels: distinct color per split (see getIndexedColor).
      color: getIndexedColor(si).dot,
    }))
  }, [funnelSeriesList, kindOrder, resolvedTheme])

  const retentionLabels = useMemo(
    () => disambiguateLabels(retentionSeriesList.map((s, si) => breakdownLabel(s.breakdown, `Series ${si + 1}`))),
    [retentionSeriesList],
  )

  const seriesNames = useMemo(() => {
    if (result.case === 'retention') {
      return retentionCohorts.map((c, i) => c.cohort || `Cohort ${i + 1}`)
    }

    return trendSeriesNames(trendSeries)
  }, [result.case, retentionCohorts, trendSeries])

  const seriesColors = useMemo(() => {
    // Breakdown splits (by $os, $utmSource, …) have no semantic palette identity,
    // so color them by index for guaranteed distinctness. Coloring by the
    // "event · value" label instead made every split inherit the event's family
    // hue — e.g. all page_view-by-$os bars came out blue. Without a breakdown,
    // keep the event kind's semantic color.
    if (result.case === 'trends') {
      return trendSeries.map((s, i) =>
        hasBreakdown(s.breakdown) ? getIndexedColor(i) : getSeriesColor(s.eventKind || `Series ${i + 1}`, i),
      )
    }
    return seriesNames.map((name, i) => getSeriesColor(name, i))
  }, [result.case, trendSeries, seriesNames, resolvedTheme])

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
          {isTopK && (
            <TopKControls topK={topK} onChange={setTopK} schema={globalSchema} schemaError={globalSchemaError} />
          )}
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
          <EventFilterBar
            filtersAtom={eventFilters.filtersAtom}
            events={schema?.events}
            schema={schema}
            schemaError={schemaError}
            showLetters={!isTopK}
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
                  Use up to two events: A defines the cohort entry event, B defines the return event. If B is omitted, A
                  is used for both cohort and return.
                </TooltipContent>
              </Tooltip>
              <span>Retention supports up to 2 events (A = cohort, B = return).</span>
            </div>
          )}
          {isTopK && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Tooltip>
                <TooltipTrigger className="inline-flex items-center cursor-help">
                  <CircleHelp className="w-3.5 h-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-xs text-xs">
                  Optionally scope the ranking to a single event (with per-event filters). Without a scope, all events
                  participate.
                </TooltipContent>
              </Tooltip>
              <span>Event scope is optional — leave empty to rank across all events.</span>
            </div>
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
          {/* Breakdowns are rejected for top-k specs — the dimension is the breakdown. */}
          {!isTopK && (
            <>
              {(propFilters.length > 0 || breakdowns.length > 0) && <span className="h-4 w-px bg-border mx-0.5" />}
              {breakdowns.map(prop => (
                <BreakdownChip key={prop} property={prop} onRemove={() => removeBreakdown(prop)} />
              ))}
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
            </>
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
        isTopK={isTopK}
        topKRows={topKRows}
        topKDimension={topK.dimension}
        topKMetric={topK.metric}
        topKOmitOthers={topK.omitOthers}
        topKIncompleteReason={topKIncomplete}
      />
    </Page>
  )
}

export default Insights
