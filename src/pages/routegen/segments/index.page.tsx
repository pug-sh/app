import { AggregationType } from '@/api/genproto/dashboard/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { EventChip, FilterBuilder, FilterChip } from '@/components/event-filters'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../events/filter-schema.atoms'
import { DateRangePicker, defaultRange, type TimeRange } from '@/components/date-range-picker'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { useFilterState, toProtoFilters } from '@/hooks/use-filter-state'
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

  const [eventKinds, setEventKinds] = useState<string[]>([])
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(defaultRange)
  const { propFilters, addFilter, updateFilter, removeFilter } = useFilterState()

  const [segmentIds, setSegmentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  const updateEvent = (idx: number, val: string) => {
    if (!val) {
      setEventKinds(eventKinds.filter((_, i) => i !== idx))
    } else {
      setEventKinds(eventKinds.map((e, i) => (i === idx ? val : e)))
    }
  }

  // Auto-run query when params change
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey serializes all query params; using it as sole dep deduplicates identical queries
  const queryKey = JSON.stringify({ eventKinds, timeRange, propFilters })

  useEffect(() => {
    const events = eventKinds.filter(e => e.trim())
    if (!project || events.length === 0) return

    const filters = toProtoFilters(propFilters)

    let cancelled = false
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const resp = await insightsRPC.segmentUsers(
          {
            timeRange: timeRange
              ? { from: timestampFromDate(timeRange.from), to: timestampFromDate(timeRange.to) }
              : undefined,
            events: events.map(kind => ({ kind, aggregation: AggregationType.TOTAL, filters })),
            pageSize: 100,
          },
          { headers }
        )
        if (!cancelled) setSegmentIds(resp.distinctIds)
      } catch (err) {
        console.error('Segment query failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(debounceRef.current) }
  }, [queryKey, project, insightsRPC, headers])

  if (!project) {
    return (
      <Page title='Segments'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <Users className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select a project first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title='Segments' description='Find users matching event criteria'>
      <div className='space-y-2 mb-5'>
        <div className='flex flex-wrap items-center gap-2'>
          <DateRangePicker value={timeRange} onChange={setTimeRange} allowUnset />
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {eventKinds.map((kind, i) => (
            <EventChip
              key={i}
              value={kind}
              onChange={v => updateEvent(i, v)}
              events={schema?.events ?? []}
              schemaError={schemaError}
            />
          ))}
          <EventChip
            value=''
            onChange={v => { if (v) setEventKinds([...eventKinds, v]) }}
            events={schema?.events ?? []}
            schemaError={schemaError}
          />
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

      {segmentIds.length > 0 ? (
        <div>
          <div className='flex items-center gap-2 mb-2'>
            <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
              Users found
            </span>
            <div className='flex-1 h-px bg-border' />
            <span className='text-[10px] text-muted-foreground'>{segmentIds.length}</span>
          </div>
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
