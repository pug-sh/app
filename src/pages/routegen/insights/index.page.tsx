import {
  AggregationType,
  Granularity,
  InsightType,
  type Series,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import { EventFilterBar, FilterBuilder, FilterChip } from '@/components/event-filters'
import Page from '@/components/layout/page'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useEventFilters } from '@/hooks/use-event-filters'
import { toProtoFilters, useFilterState } from '@/hooks/use-filter-state'
import { INSIGHTS_PRESETS } from '@/lib/date-presets'
import { toProtoTimeRange, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { useAtomValue, useSetAtom } from 'jotai'
import { BarChart3, Clock, Loader2, type LucideIcon, Ruler, TrendingUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../events/filter-schema.atoms'
import { SERIES_COLORS } from './chart-colors'
import { AreaChart, BarChart, type ChartPoint, DataTable, LineChart, SummaryStats } from './charts'

// ── Constants ───────────────────────────────────────────────────────────────

const GRANULARITIES = [
  { label: 'Hour', value: Granularity.HOUR },
  { label: 'Day', value: Granularity.DAY },
  { label: 'Week', value: Granularity.WEEK },
  { label: 'Month', value: Granularity.MONTH },
] as const

const AGGREGATIONS = [
  { label: 'Total events', value: AggregationType.TOTAL },
  { label: 'Unique users', value: AggregationType.UNIQUE_USERS },
  { label: 'Avg per user', value: AggregationType.PER_USER_AVG },
] as const

type ViewMode = 'line' | 'area' | 'bar-grouped' | 'bar-stacked' | 'table'

const VIEW_MODES: readonly { label: string; value: ViewMode }[] = [
  { label: 'Line', value: 'line' },
  { label: 'Area', value: 'area' },
  { label: 'Bar (grouped)', value: 'bar-grouped' },
  { label: 'Bar (stacked)', value: 'bar-stacked' },
  { label: 'Table', value: 'table' },
]

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
  options: readonly { label: string; value: T }[]
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
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={cn(
                'px-3 py-1.5 text-xs text-left rounded-md transition-colors cursor-pointer',
                opt.value === value
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
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

  const baseFilters = useEventFilters()
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(() => INSIGHTS_PRESETS[0].resolve())
  const [granularity, setGranularity] = useState(Granularity.DAY)
  const [aggregations, setAggregations] = useState<AggregationType[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('line')
  const { propFilters, addFilter, updateFilter, removeFilter } = useFilterState()

  const getAggregation = (idx: number) => aggregations[idx] ?? AggregationType.TOTAL
  const setAggregation = (idx: number, agg: AggregationType) => {
    setAggregations(prev => {
      const next = [...prev]
      while (next.length <= idx) next.push(AggregationType.TOTAL)
      next[idx] = agg
      return next
    })
  }

  // Wrap mutations to keep aggregations array in sync with entries
  const removeWithAgg = (idx: number) => {
    baseFilters.removeEvent(idx)
    setAggregations(prev => prev.filter((_, i) => i !== idx))
  }
  const eventFilters = {
    ...baseFilters,
    addEvent: (kind: string) => {
      baseFilters.addEvent(kind)
      setAggregations(prev => [...prev, AggregationType.TOTAL])
    },
    removeEvent: removeWithAgg,
    updateEventKind: (idx: number, kind: string) => {
      if (!kind) {
        removeWithAgg(idx)
      } else {
        baseFilters.updateEventKind(idx, kind)
      }
    },
  }

  const [series, setSeries] = useState<Series[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  // Auto-run query when params change
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const queryKey = JSON.stringify({ entries: eventFilters.entries, timeRange, granularity, aggregations, propFilters, retryCount })

  useEffect(() => {
    const validEntries = eventFilters.entries.filter(e => e.kind.trim())
    if (!project || validEntries.length === 0 || !timeRange) return

    const globalFilters = toProtoFilters(propFilters)

    let cancelled = false
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await insightsRPC.query(
          {
            insightType: InsightType.TRENDS,
            granularity,
            timeRange: toProtoTimeRange(timeRange),
            events: validEntries.map((entry, i) => ({
              event: {
                kind: entry.kind,
                filters: toProtoFilters(entry.filters),
              },
              aggregation: getAggregation(i),
            })),
            filters: globalFilters,
          },
          { headers }
        )
        if (!cancelled) setSeries(resp.series)
      } catch (err) {
        console.error('Insights query failed:', err)
        if (!cancelled) { setSeries([]); setError('Failed to load insights') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey already captures all user-controlled query inputs
  }, [queryKey, project, insightsRPC, headers])

  const seriesNames = series.map(s => s.eventKind || 'unknown')
  const chartData: ChartPoint[] =
    series.length > 0
      ? series[0].points.map((p, i) => ({
        date: tsToDate(p.time) ?? new Date(),
        values: series.map(s => Number(s.points[i]?.value) || 0),
      }))
      : []
  const allZero = chartData.every(d => d.values.every(v => v === 0))

  const renderChart = () => {
    if (allZero) {
      return (
        <div className='flex items-center justify-center h-48 text-muted-foreground'>
          <p className='text-sm'>No events recorded in this period</p>
        </div>
      )
    }
    if (viewMode === 'line') return <LineChart data={chartData} seriesNames={seriesNames} granularity={granularity} />
    if (viewMode === 'area') return <AreaChart data={chartData} seriesNames={seriesNames} granularity={granularity} />
    if (viewMode === 'table') return <DataTable data={chartData} seriesNames={seriesNames} granularity={granularity} />
    return <BarChart data={chartData} seriesNames={seriesNames} granularity={granularity} stacked={viewMode === 'bar-stacked'} />
  }

  if (!project) return <NoProject title='Insights' icon={TrendingUp} />

  return (
    <Page title='Insights' description='Analyze event trends'>
      {/* Query config — sticky */}
      <div className='sticky top-0 z-10 bg-background -mx-8 px-8 pt-4 pb-3 space-y-2 border-b border-border/50'>
        <div className='flex flex-wrap items-center gap-2'>
          <DateRangePicker value={timeRange} onChange={setTimeRange} presets={INSIGHTS_PRESETS} />
          <OptionChip label='granularity' icon={Clock} options={GRANULARITIES} value={granularity} onChange={setGranularity} />
          <OptionChip label='view' icon={BarChart3} options={VIEW_MODES} value={viewMode} onChange={setViewMode} />
        </div>

        {/* Events + per-event filters + per-event aggregation */}
        <EventFilterBar
          filters={eventFilters}
          events={schema?.events ?? []}
          schema={schema}
          schemaError={schemaError}
          showLetters
          seriesColors={SERIES_COLORS}
          renderRowExtra={i => (
            <OptionChip label='measure' icon={Ruler} options={AGGREGATIONS} value={getAggregation(i)} onChange={v => setAggregation(i, v)} />
          )}
        />

        {/* Global filters */}
        <div className='flex flex-wrap items-center gap-2'>
          {propFilters.map((f, i) => (
            <FilterChip
              key={`f-${i}`}
              filter={f}
              schema={schema}
              onRemove={() => removeFilter(i)}
              onUpdate={next => updateFilter(i, next)}
            />
          ))}
          <FilterBuilder schema={schema} schemaError={schemaError} onAdd={addFilter} />
          {loading && <Loader2 className='w-3.5 h-3.5 animate-spin text-muted-foreground ml-1' />}
        </div>
      </div>

      {error ? (
        <div className='flex flex-col items-center justify-center py-16'>
          <TrendingUp className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>{error}</p>
          <Button variant='outline' size='sm' className='mt-2' onClick={() => setRetryCount(c => c + 1)}>
            Retry
          </Button>
        </div>
      ) : chartData.length > 0 ? (
        <div>
          <SummaryStats series={seriesNames} data={chartData} />
          {renderChart()}
        </div>
      ) : (
        !loading && (
          <div className='flex flex-col items-center justify-center py-20 text-muted-foreground'>
            <TrendingUp className='w-10 h-10 mb-4 opacity-15' />
            <p className='text-sm font-medium mb-1'>No data yet</p>
            <p className='text-xs'>Pick an event above to start</p>
          </div>
        )
      )}
    </Page>
  )
}

export default Insights
