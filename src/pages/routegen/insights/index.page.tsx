import {
  AggregationType,
  Granularity,
  InsightType,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import { EventFilterBar, FilterBuilder, FilterChip } from '@/components/event-filters'
import Page from '@/components/layout/page'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useEventFilters } from '@/hooks/use-event-filters'
import { toProtoFilters, useFilterState } from '@/hooks/use-filter-state'
import { useGlobalFilterSchema } from '@/hooks/use-global-filter-schema'
import { readFilterQueryParams, writeFilterQueryParams } from '@/hooks/use-filter-query-params'
import { GRANULARITIES, GRANULARITY_VALUES, useGranularity } from '@/hooks/use-granularity'
import { INSIGHTS_PRESETS } from '@/lib/date-presets'
import { toProtoTimeRange, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useDebouncedQuery } from '@/hooks/use-debounced-query'
import { useAtomValue, useSetAtom } from 'jotai'
import { BarChart3, CircleHelp, Clock, Loader2, type LucideIcon, Ruler, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../events/filter-schema.atoms'
import { getSeriesColor } from '@/lib/event-colors'
import { AreaChart, BarChart, type ChartPoint, DataTable, FunnelChart, LineChart, RetentionCohort, SummaryStats } from './charts'

// ── Constants ───────────────────────────────────────────────────────────────

const AGGREGATIONS = [
  { label: 'Total events', value: AggregationType.TOTAL },
  { label: 'Unique users', value: AggregationType.UNIQUE_USERS },
  { label: 'Avg per user', value: AggregationType.PER_USER_AVG },
] as const

const INSIGHT_TYPES = [
  { label: 'Trends', value: InsightType.TRENDS },
  { label: 'Funnel', value: InsightType.FUNNEL },
  { label: 'Retention', value: InsightType.RETENTION },
] as const
const INSIGHT_TYPE_VALUES = INSIGHT_TYPES.map(x => x.value) as InsightType[]

type ViewMode = 'line' | 'area' | 'bar-grouped' | 'bar-stacked' | 'table'

const VIEW_MODES: readonly { label: string; value: ViewMode }[] = [
  { label: 'Line', value: 'line' },
  { label: 'Area', value: 'area' },
  { label: 'Bar (grouped)', value: 'bar-grouped' },
  { label: 'Bar (stacked)', value: 'bar-stacked' },
  { label: 'Table', value: 'table' },
]

const EMPTY_RESULT = { case: undefined, value: undefined } as const
const EMPTY_ARRAY: never[] = []

const getPageDescription = (insightType: InsightType) => {
  if (insightType === InsightType.TRENDS) return 'Analyze event trends'
  if (insightType === InsightType.RETENTION) return 'Analyze cohort retention over time'
  return 'Analyze step-by-step conversion'
}

// ── Option Chip ─────────────────────────────────────────────────────────────

const OptionChip = <T extends string | number>({
  label,
  icon: Icon,
  options,
  value,
  onChange,
}: {
  label: string
  icon?: LucideIcon
  options: readonly { label: string; value: T; disabled?: boolean }[]
  value: T
  onChange: (v: T) => void
}) => {
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className='inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7 cursor-pointer hover:bg-muted/40 transition-colors'>
        <span className='px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px] gap-1'>
          {Icon && <Icon className='w-3 h-3' />}
          {label}
        </span>
        <span className='px-2 h-full flex items-center'>{current?.label}</span>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-1'>
        <div className='flex flex-col gap-0.5'>
          {options.map(opt => (
            <button
              key={String(opt.value)}
              type='button'
              disabled={opt.disabled}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={cn(
                'px-3 py-1.5 text-xs text-left rounded-md transition-colors cursor-pointer',
                'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                opt.value === value && 'bg-muted text-foreground font-medium',
                opt.disabled && 'text-muted-foreground/40 cursor-default pointer-events-none',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const Insights = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)
  const initialFilterState = useMemo(() => readFilterQueryParams(), [])
  useEffect(() => { if (initialFilterState.parseWarning) toast.warning(initialFilterState.parseWarning) }, []) // eslint-disable-line react-hooks/exhaustive-deps -- fire once on mount

  const eventFilters = useEventFilters(initialFilterState.eventFilters)
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(() => initialFilterState.timeRange ?? INSIGHTS_PRESETS[0].resolve())
  const [insightType, setInsightType] = useState(() =>
    initialFilterState.insightType !== undefined && INSIGHT_TYPE_VALUES.includes(initialFilterState.insightType)
      ? initialFilterState.insightType
      : InsightType.TRENDS
  )
  const { granularity, setGranularity, options: granularityOptions } = useGranularity(
    timeRange,
    GRANULARITY_VALUES.includes(initialFilterState.granularity as Granularity)
      ? initialFilterState.granularity as Granularity
      : Granularity.DAY
  )
  const [viewMode, setViewMode] = useState<ViewMode>('line')
  const { propFilters, addFilter, updateFilter, removeFilter } = useFilterState(initialFilterState.propFilters)

  const getAggregation = (idx: number) => eventFilters.entries[idx]?.aggregation ?? AggregationType.TOTAL

  // Cap entries at 2 when switching to retention mode
  const eventFiltersRef = useRef(eventFilters)
  // eslint-disable-next-line react-hooks/refs -- intentional: sync ref in render so effect reads latest entries without re-triggering
  eventFiltersRef.current = eventFilters
  useEffect(() => {
    if (insightType !== InsightType.RETENTION || eventFiltersRef.current.entries.length <= 2) return
    eventFiltersRef.current.reset(eventFiltersRef.current.entries.slice(0, 2))
  }, [insightType])

  const { schema: globalSchema, schemaError: globalSchemaError } = useGlobalFilterSchema({
    baseSchema: schema,
    baseSchemaError: schemaError,
    selectedEventKinds: eventFilters.entries.map(e => e.kind),
  })

  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  useEffect(() => {
    writeFilterQueryParams(eventFilters.entries, propFilters, { insightType, granularity, timeRange })
  }, [eventFilters.entries, propFilters, insightType, granularity, timeRange])

  const validEntries = eventFilters.validEntries

  const queryKey = JSON.stringify({
    entries: eventFilters.entries,
    timeRange,
    insightType,
    granularity,
    propFilters,
  })

  const { data: queryResult, loading, error, retry } = useDebouncedQuery(
    queryKey,
    async () => {
      const globalFilters = toProtoFilters(propFilters)
      const filterGroups =
        globalFilters.length > 0
          ? [{ filters: globalFilters, operator: LogicalOperator.AND }]
          : []
      const resp = await insightsRPC.query(
        {
          insightType,
          granularity,
          timeRange: toProtoTimeRange(timeRange),
          events: validEntries.map((entry, i) => ({
            event: {
              kind: entry.kind,
              filters: toProtoFilters(entry.filters),
            },
            aggregation: insightType === InsightType.TRENDS ? getAggregation(i) : AggregationType.TOTAL,
          })),
          filterGroups,
          filterGroupsOperator: LogicalOperator.AND,
        },
        { headers }
      )
      return resp.result
    },
    { enabled: !!project && validEntries.length > 0 && !!timeRange }
  )

  const result = queryResult ?? EMPTY_RESULT

  const unknownResultCase = result.case !== undefined && result.case !== 'trends' && result.case !== 'funnel' && result.case !== 'retention'
  useEffect(() => {
    if (unknownResultCase) console.warn('Unrecognized insight result case:', result.case)
  }, [unknownResultCase, result.case])

  const trendSeries = useMemo(() => {
    if (result.case !== 'trends') return EMPTY_ARRAY
    const kindEntries = eventFilters.validEntries
    return [...result.value.series].sort((a, b) => {
      const ai = kindEntries.findIndex(e => e.kind === a.eventKind)
      const bi = kindEntries.findIndex(e => e.kind === b.eventKind)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [result, eventFilters.validEntries])
  const retentionCohorts = result.case === 'retention' ? result.value.cohorts : EMPTY_ARRAY
  const funnelSteps = useMemo(() => {
    if (result.case !== 'funnel') return []
    const kindEntries = eventFilters.validEntries
    return [...result.value.steps]
      .sort((a, b) => {
        const ai = kindEntries.findIndex(e => e.kind === a.eventKind)
        const bi = kindEntries.findIndex(e => e.kind === b.eventKind)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
      .map((s, i) => ({ name: s.eventKind || `Step ${i + 1}`, count: Number(s.total) || 0 }))
  }, [result, eventFilters.validEntries])
  const seriesNames = useMemo(
    () => result.case === 'retention'
      ? retentionCohorts.map((c, i) => c.cohort || `Cohort ${i + 1}`)
      : trendSeries.map((s, i) => s.eventKind || `series ${i + 1}`),
    [result.case, trendSeries, retentionCohorts]
  )
  const seriesColors = useMemo(
    () => seriesNames.map((name, i) => getSeriesColor(name, i)),
    [seriesNames]
  )
  const eventFilterColors = useMemo(
    () => eventFilters.entries.map((entry, i) => getSeriesColor(entry.kind || `step ${i + 1}`, i)),
    [eventFilters.entries]
  )
  const chartData: ChartPoint[] =
    trendSeries.length > 0
      ? trendSeries[0].points
        .map((p, i) => {
          const date = tsToDate(p.time)
          if (!date) return null
          return {
            date,
            values: trendSeries.map(s => Number(s.points[i]?.value) || 0),
          }
        })
        .filter((d): d is ChartPoint => d !== null)
      : []

  const isTrends = insightType === InsightType.TRENDS
  const isRetention = insightType === InsightType.RETENTION
  const isTimeSeriesInsight = isTrends || isRetention
  const hasFunnelData = funnelSteps.some(step => step.count > 0)
  const allZero = chartData.every(d => d.values.every(v => v === 0))
  const stickyClassName = isRetention ? 'relative z-auto' : 'sticky top-0 z-10'
  const maxEvents = isRetention ? 2 : undefined
  const renderRowExtra = isTrends
    ? (i: number) => (
      <OptionChip label='measure' icon={Ruler} options={AGGREGATIONS} value={getAggregation(i)} onChange={v => eventFilters.setAggregation(i, v)} />
    )
    : undefined

  const renderChart = () => {
    if (allZero) {
      return (
        <div className='flex items-center justify-center h-48 text-muted-foreground'>
          <p className='text-sm'>No events recorded in this period</p>
        </div>
      )
    }
    if (viewMode === 'line') return <LineChart data={chartData} seriesNames={seriesNames} seriesColors={seriesColors} granularity={granularity} />
    if (viewMode === 'area') return <AreaChart data={chartData} seriesNames={seriesNames} seriesColors={seriesColors} granularity={granularity} />
    if (viewMode === 'table') return <DataTable data={chartData} seriesNames={seriesNames} seriesColors={seriesColors} granularity={granularity} />
    return <BarChart data={chartData} seriesNames={seriesNames} seriesColors={seriesColors} granularity={granularity} stacked={viewMode === 'bar-stacked'} />
  }

  const renderLoadingEmptyState = () => {
    if (loading) return null

    return (
      <div className='flex flex-col items-center justify-center py-20 text-muted-foreground'>
        <TrendingUp className='w-10 h-10 mb-4 opacity-15' />
        <p className='text-sm font-medium mb-1'>No data yet</p>
        <p className='text-xs'>Pick an event above to start</p>
      </div>
    )
  }

  const renderFunnelContent = () => {
    if (funnelSteps.length === 0) return renderLoadingEmptyState()

    if (hasFunnelData) {
      return <FunnelChart steps={funnelSteps} seriesColors={funnelSteps.map((s, i) => getSeriesColor(s.name, i))} />
    }

    return (
      <div className='flex items-center justify-center h-48 text-muted-foreground'>
        <p className='text-sm'>No events recorded in this period</p>
      </div>
    )
  }

  const renderMainContent = () => {
    if (error) {
      return (
        <div className='flex flex-col items-center justify-center py-16'>
          <TrendingUp className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>{error}</p>
          <Button variant='outline' size='sm' className='mt-2' onClick={retry}>
            Retry
          </Button>
        </div>
      )
    }

    if (unknownResultCase) {
      return (
        <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
          <TrendingUp className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm'>Unsupported result type</p>
        </div>
      )
    }

    if (isRetention && retentionCohorts.length > 0) {
      return <RetentionCohort cohorts={retentionCohorts} granularity={granularity} seriesColors={seriesColors} />
    }

    if (isTrends && chartData.length > 0) {
      return (
        <div>
          <SummaryStats series={seriesNames} data={chartData} seriesColors={seriesColors} />
          {renderChart()}
        </div>
      )
    }

    if (!isTrends) return renderFunnelContent()

    return renderLoadingEmptyState()
  }

  if (!project) return <NoProject title='Insights' icon={TrendingUp} />

  return (
    <Page
      title='Insights'
      description={getPageDescription(insightType)}
    >
      {/* Query config — sticky */}
      <div className={cn(
        '-mx-8 px-8 space-y-2 border-b border-border/50 bg-background -mt-4 pt-1 pb-2 mb-4',
        stickyClassName
      )}>
        <div className='flex flex-wrap items-center gap-2'>
          <DateRangePicker value={timeRange} onChange={setTimeRange} presets={INSIGHTS_PRESETS} />
          <OptionChip label='insight' options={INSIGHT_TYPES} value={insightType} onChange={setInsightType} />
          {isTimeSeriesInsight && (
            <>
              <OptionChip label='granularity' icon={Clock} options={granularityOptions} value={granularity} onChange={setGranularity} />
              {isTrends && (
                <OptionChip label='view' icon={BarChart3} options={VIEW_MODES} value={viewMode} onChange={setViewMode} />
              )}
            </>
          )}
        </div>

        {/* Events + per-event filters + per-event aggregation */}
        <div className='space-y-1'>
          <EventFilterBar
            filters={eventFilters}
            events={schema?.events ?? []}
            schema={schema}
            schemaError={schemaError}
            showLetters
            seriesColors={eventFilterColors}
            getEventColor={eventName => getSeriesColor(eventName).dot}
            renderRowExtra={renderRowExtra}
            maxEvents={maxEvents}
          />
          {isRetention && (
            <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
              <Tooltip>
                <TooltipTrigger className='inline-flex items-center cursor-help'>
                  <CircleHelp className='w-3.5 h-3.5' />
                </TooltipTrigger>
                <TooltipContent side='bottom' align='start' className='max-w-xs text-xs'>
                  Use up to two events: A defines the cohort entry event, B defines the return event.
                  If B is omitted, A is used for both cohort and return.
                </TooltipContent>
              </Tooltip>
              <span>Retention supports up to 2 events (A = cohort, B = return).</span>
            </div>
          )}
        </div>

        {/* Global filters */}
        <div className='flex flex-wrap items-center gap-2'>
          {propFilters.map((f, i) => (
            <FilterChip
              key={`f-${i}`}
              filter={f}
              schema={globalSchema}
              onRemove={() => removeFilter(i)}
              onUpdate={next => updateFilter(i, next)}
            />
          ))}
          <FilterBuilder schema={globalSchema} schemaError={globalSchemaError} onAdd={addFilter} />
          {loading && <Loader2 className='w-3.5 h-3.5 animate-spin text-muted-foreground ml-1' />}
        </div>
      </div>

      {renderMainContent()}
    </Page>
  )
}

export default Insights
