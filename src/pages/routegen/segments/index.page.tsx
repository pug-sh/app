import { AggregationType, LogicalOperator } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import NoProject from '@/components/no-project'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { EventFilterBar, FilterBuilder, FilterChip } from '@/components/event-filters'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../events/filter-schema.atoms'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import { defaultRange } from '@/lib/date-presets'
import { useFilterState, toProtoFilters } from '@/hooks/use-filter-state'
import { useEventFilters } from '@/hooks/use-event-filters'
import { useGlobalFilterSchema } from '@/hooks/use-global-filter-schema'
import { toProtoTimeRange } from '@/lib/timestamp'
import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ProjectLink from '@/components/project-link'

// ── Main Component ──────────────────────────────────────────────────────────

const Segments = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)

  const eventFilters = useEventFilters()
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(defaultRange)
  const { propFilters, addFilter, updateFilter, removeFilter } = useFilterState()
  const { schema: globalSchema, schemaError: globalSchemaError } = useGlobalFilterSchema({
    baseSchema: schema,
    baseSchemaError: schemaError,
    selectedEventKinds: eventFilters.entries.map(e => e.kind),
  })

  const [segmentIds, setSegmentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  // Auto-run query when params change
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const queryKey = JSON.stringify({ entries: eventFilters.entries, timeRange, propFilters, retryCount })

  useEffect(() => {
    const validEntries = eventFilters.entries.filter(e => e.kind.trim())
    if (!project || validEntries.length === 0) return

    const globalFilters = toProtoFilters(propFilters)
    const filterGroups =
      globalFilters.length > 0
        ? [
          {
            filters: globalFilters,
            operator: LogicalOperator.AND,
          },
        ]
        : []

    let cancelled = false
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await insightsRPC.segmentUsers(
          {
            timeRange: toProtoTimeRange(timeRange),
            events: validEntries.map(entry => ({
              event: {
                kind: entry.kind,
                filters: toProtoFilters(entry.filters),
              },
              aggregation: AggregationType.TOTAL,
            })),
            filterGroups,
            filterGroupsOperator: LogicalOperator.AND,
            pageSize: 100,
          },
          { headers }
        )
        if (!cancelled) setSegmentIds(resp.distinctIds)
      } catch (err) {
        console.error('Segment query failed:', err)
        if (!cancelled) setError('Segment query failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey serializes all query params; using it as sole dep deduplicates identical queries
  }, [queryKey, project, insightsRPC, headers])

  if (!project) return <NoProject title='Segments' icon={Users} />

  return (
    <Page title='Segments' description='Find users matching event criteria'>
      <div className='space-y-2 mb-5'>
        <div className='flex flex-wrap items-center gap-2'>
          <DateRangePicker value={timeRange} onChange={setTimeRange} allowUnset />
        </div>
        <EventFilterBar
          filters={eventFilters}
          events={schema?.events ?? []}
          schema={schema}
          schemaError={schemaError}
        />
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

      {error ? (
        <div className='flex flex-col items-center justify-center py-16'>
          <Users className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>{error}</p>
          <Button variant='outline' size='sm' className='mt-2' onClick={() => setRetryCount(c => c + 1)}>
            Retry
          </Button>
        </div>
      ) : segmentIds.length > 0 ? (
        <div>
          <SectionHeader title='Users found' count={segmentIds.length} />
          <table className='w-full'>
            <thead>
              <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
                <th className='py-2 pr-2 text-left font-medium w-16'>#</th>
                <th className='py-2 pr-2 text-left font-medium'>Distinct ID</th>
              </tr>
            </thead>
            <tbody>
              {segmentIds.map((id, i) => (
                <tr key={id} className='border-b border-border/50 transition-colors hover:bg-muted/40'>
                  <td className='py-2 pr-2 text-muted-foreground tabular-nums text-xs'>{i + 1}</td>
                  <td className='py-2 pr-2 text-sm'>
                    <ProjectLink
                      href={`/activities/${encodeURIComponent(id)}`}
                      className='font-mono text-primary hover:underline underline-offset-4'
                    >
                      {id}
                    </ProjectLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && (
          <div className='flex flex-col items-center justify-center py-20 text-muted-foreground'>
            <Users className='w-10 h-10 mb-4 opacity-15' />
            <p className='text-sm font-medium mb-1'>Find your users</p>
            <p className='text-xs'>Pick events and filters to find matching users</p>
          </div>
        )
      )}
    </Page>
  )
}

export default Segments
