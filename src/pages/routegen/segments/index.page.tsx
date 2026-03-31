import { AggregationType } from '@/api/genproto/dashboard/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { EventChip, FilterBuilder, FilterChip, type ActiveFilter } from '@/components/event-filters'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../events/filter-schema.atoms'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { cn } from '@/lib/utils'
import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ProjectLink from '@/components/project-link'

// ── Constants ───────────────────────────────────────────────────────────────

const timeRanges = [
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '14d', ms: 14 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
] as const

// ── Pill Selector ───────────────────────────────────────────────────────────

const PillGroup = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) => (
  <div className='inline-flex rounded-lg border border-border bg-muted/30 p-0.5'>
    {options.map(opt => (
      <button
        key={String(opt.value)}
        type='button'
        onClick={() => onChange(opt.value)}
        className={cn(
          'px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer',
          opt.value === value
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>
)

// ── Main Component ──────────────────────────────────────────────────────────

const Segments = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)

  const [eventKinds, setEventKinds] = useState<string[]>([])
  const [rangeIdx, setRangeIdx] = useState(1)
  const [propFilters, setPropFilters] = useState<ActiveFilter[]>([])

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

  const addFilter = (f: ActiveFilter) => setPropFilters(prev => [...prev, f])
  const updateFilter = (idx: number, f: ActiveFilter) => setPropFilters(prev => prev.map((x, i) => i === idx ? f : x))
  const removeFilter = (idx: number) => setPropFilters(prev => prev.filter((_, i) => i !== idx))

  // Auto-run query when params change
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryKey = JSON.stringify({ eventKinds, rangeIdx, propFilters })

  useEffect(() => {
    const events = eventKinds.filter(e => e.trim())
    if (!project || events.length === 0) return

    const filters = propFilters.map(f => ({
      property: f.property,
      operator: f.operator,
      value: f.value,
      values: f.values,
    }))

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const now = new Date()
        const from = new Date(now.getTime() - timeRanges[rangeIdx].ms)
        const resp = await insightsRPC.segmentUsers(
          {
            timeRange: { from: timestampFromDate(from), to: timestampFromDate(now) },
            events: events.map(kind => ({ kind, aggregation: AggregationType.TOTAL, filters })),
            pageSize: 100,
          },
          { headers }
        )
        setSegmentIds(resp.distinctIds)
      } catch (err) {
        console.error('Segment query failed:', err)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
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
      <div className='space-y-3 mb-5'>
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

        <PillGroup
          options={timeRanges.map((t, i) => ({ label: t.label, value: i }))}
          value={rangeIdx}
          onChange={setRangeIdx}
        />
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
