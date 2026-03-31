import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EventChip, FilterBuilder, FilterChip, kindStyle, type ActiveFilter } from '@/components/event-filters'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt'
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import HoverSwap from '@/components/hover-swap'
import { formatRelative } from '@/hooks/use-relative-time'
import ProjectLink from '@/components/project-link'
import { structGet, structToEntries } from '@/lib/struct'
import { cn } from '@/lib/utils'
import { useAtomValue, useSetAtom } from 'jotai'
import { Toggle } from '@/components/ui/toggle'
import { AlertCircle, Braces, ChevronDown, ChevronRight, List, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from './filter-schema.atoms'

// ── Helpers ─────────────────────────────────────────────────────────────────

const tsToDate = (ts: Timestamp | undefined): Date | null => {
  if (!ts) return null
  try {
    return timestampDate(ts)
  } catch (err) {
    console.warn('Invalid timestamp:', ts, err)
    return null
  }
}

const formatAbsolute = (d: Date): string => {
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })
  )
}

const TIME_RANGES = [
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '14d', ms: 14 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
] as const

// OPERATORS, ActiveFilter, EventChip, FilterBuilder, FilterChip, kindStyle
// are imported from @/components/event-filters
// ── Event Row ───────────────────────────────────────────────────────────────

const EventRow = ({ event }: { event: ActivityEvent }) => {
  const [expanded, setExpanded] = useState(false)
  const [jsonMode, setJsonMode] = useState(false)
  const d = tsToDate(event.occurTime)
  const autoProps = structToEntries(event.autoProperties)
  const customProps = structToEntries(event.customProperties)
  const inlineProps = customProps.slice(0, 3)
  const hasMore = autoProps.length > 0 || customProps.length > 3
  const colors = kindStyle(event.kind)
  const platform = structGet(event.autoProperties, '$platform')
  const osVersion = structGet(event.autoProperties, '$os_version')
  const city = structGet(event.autoProperties, '$city')
  const country = structGet(event.autoProperties, '$country')

  return (
    <>
      <tr
        className={cn(
          'group border-b border-border/50 transition-colors',
          hasMore && 'cursor-pointer hover:bg-muted/40'
        )}
        onClick={() => hasMore && setExpanded(!expanded)}
      >
        <td className='py-2.5 pr-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap align-middle w-[120px]'>
          {d && <HoverSwap primary={formatRelative(d)} secondary={formatAbsolute(d)} />}
        </td>
        <td className='py-2.5 pr-2 align-middle'>
          <Badge variant='secondary' className={cn('text-[11px] font-medium px-2 py-0.5', colors.bg, colors.text)}>
            {event.kind}
          </Badge>
        </td>
        <td className='py-2.5 pr-2 text-xs text-muted-foreground whitespace-nowrap align-middle'>
          {(city || country) && [city, country].filter(Boolean).join(', ')}
        </td>
        <td className='py-2.5 pr-2 text-xs text-muted-foreground whitespace-nowrap align-middle'>
          {(platform || osVersion) && [platform, osVersion].filter(Boolean).join(' ')}
        </td>
        <td className='py-2.5 pr-2 align-middle'>
          {inlineProps.length > 0 && (
            <div className='flex items-center gap-2 overflow-hidden'>
              {inlineProps.map(([k, v]) => (
                <span key={k} className='text-[11px] text-muted-foreground whitespace-nowrap'>
                  {k}: <span className='font-mono'>{v}</span>
                </span>
              ))}
            </div>
          )}
        </td>
        <td className='py-2.5 pr-2 text-right whitespace-nowrap align-middle'>
          <ProjectLink
            href={`/activities/${encodeURIComponent(event.distinctId)}`}
            onClick={e => e.stopPropagation()}
            className='text-xs font-mono text-primary hover:underline underline-offset-4'
          >
            {event.distinctId}
          </ProjectLink>
          {event.sessionId && (
            <>
              <span className='text-muted-foreground/40'> / </span>
              <ProjectLink
                href={`/activities/${encodeURIComponent(event.distinctId)}/${encodeURIComponent(event.sessionId)}`}
                onClick={e => e.stopPropagation()}
                className='text-xs font-mono text-primary hover:underline underline-offset-4'
              >
                {event.sessionId.slice(0, 8)}
              </ProjectLink>
            </>
          )}
        </td>
        <td className='py-2.5 w-5 align-middle'>
          {hasMore &&
            (expanded ? (
              <ChevronDown className='w-3.5 h-3.5 text-muted-foreground' />
            ) : (
              <ChevronRight className='w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity' />
            ))}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td className='pb-3 pt-1 align-top w-[120px]' onClick={e => e.stopPropagation()}>
            <Toggle size='sm' pressed={jsonMode} onPressedChange={setJsonMode}>
              <Braces className='w-3.5 h-3.5' />
            </Toggle>
          </td>
          <td colSpan={6} className='pb-3 pt-0'>
            {jsonMode ? (
              <pre className='text-xs font-mono bg-muted/50 rounded-t-none rounded-b-md p-3 overflow-x-auto whitespace-pre-wrap break-all'>
                {JSON.stringify(
                  {
                    event_id: event.eventId,
                    kind: event.kind,
                    distinct_id: event.distinctId,
                    session_id: event.sessionId || undefined,
                    occur_time: d?.toISOString(),
                    auto_properties: event.autoProperties,
                    custom_properties: event.customProperties,
                  },
                  null,
                  2
                )}
              </pre>
            ) : (
              <div className='space-y-2'>
                {autoProps.length > 0 && (
                  <div>
                    <p className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1'>
                      System
                    </p>
                    <div className='flex flex-wrap gap-1'>
                      {autoProps.map(([k, v]) => (
                        <span
                          key={k}
                          className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'
                        >
                          <span className='text-muted-foreground'>{k}</span>
                          <span className='font-mono'>{v}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {customProps.length > 0 && (
                  <div>
                    <p className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1'>
                      Custom
                    </p>
                    <div className='flex flex-wrap gap-1'>
                      {customProps.map(([k, v]) => (
                        <span
                          key={k}
                          className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'
                        >
                          <span className='text-muted-foreground'>{k}</span>
                          <span className='font-mono'>{v}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className='text-[10px] text-muted-foreground/40 font-mono'>{event.eventId}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const EventExplorer = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const activityRPC = useAtomValue(activityRPCAtom)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)

  // Applied filter state (drives API calls)
  const [kindFilter, setKindFilter] = useState('')
  const [userInput, setUserInput] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [rangeIdx, setRangeIdx] = useState(2) // 14d
  const [propFilters, setPropFilters] = useState<ActiveFilter[]>([])

  // Data
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [nextToken, setNextToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch schema once when project is available
  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  const addFilter = (f: ActiveFilter) => setPropFilters(prev => [...prev, f])

  const updateFilter = (idx: number, f: ActiveFilter) => setPropFilters(prev => prev.map((x, i) => i === idx ? f : x))

  const removeFilter = (idx: number) => setPropFilters(prev => prev.filter((_, i) => i !== idx))

  const commitUserFilter = () => {
    setUserFilter(userInput.trim())
  }

  const fetchEvents = useCallback(
    async (pageToken = '') => {
      setLoading(true)
      setError(null)
      try {
        const now = new Date()
        const from = new Date(now.getTime() - TIME_RANGES[rangeIdx].ms)
        const resp = await activityRPC.getEventExplorer(
          {
            distinctId: userFilter || undefined,
            kind: kindFilter || undefined,
            timeRange: { from: timestampFromDate(from), to: timestampFromDate(now) },
            propertyFilters: propFilters.map(f => ({
              property: f.property,
              operator: f.operator,
              value: f.value,
              values: f.values,
            })),
            pageSize: 100,
            pageToken,
          },
          { headers }
        )
        if (pageToken) {
          setEvents(prev => [...prev, ...resp.events])
        } else {
          setEvents(resp.events)
        }
        setNextToken(resp.nextPageToken)
      } catch (err) {
        console.error('Event explorer failed:', err)
        setError(pageToken ? 'Failed to load more events' : 'Failed to load events')
      } finally {
        setLoading(false)
      }
    },
    [activityRPC, headers, kindFilter, userFilter, rangeIdx, propFilters]
  )

  useEffect(() => {
    if (project) fetchEvents()
  }, [project, fetchEvents])

  if (!project) {
    return (
      <Page title='Events'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <List className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select a project first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title='Events' description='Browse raw events across all users'>
      {/* Filter bar */}
      <div className='space-y-3 mb-5'>
        {/* Time range + count */}
        <div className='flex items-center gap-3'>
          <div className='inline-flex rounded-lg border border-border bg-muted/30 p-0.5'>
            {TIME_RANGES.map((range, i) => (
              <button
                key={range.label}
                type='button'
                onClick={() => setRangeIdx(i)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer',
                  i === rangeIdx
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
          {events.length > 0 && (
            <span className='ml-auto text-xs text-muted-foreground tabular-nums'>{events.length} events</span>
          )}
        </div>

        {/* Filters row */}
        <div className='flex items-center gap-2 flex-wrap'>
          <EventChip value={kindFilter} onChange={setKindFilter} events={schema?.events ?? []} schemaError={schemaError} />
          {userFilter ? (
            <span className='inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7'>
              <span className='px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px]'>user</span>
              <Popover>
                <PopoverTrigger className='px-2 h-full flex items-center font-mono hover:bg-muted/40 transition-colors cursor-pointer'>
                  {userFilter}
                </PopoverTrigger>
                <PopoverContent align='start' className='w-52 p-2'>
                  <input
                    defaultValue={userFilter}
                    placeholder='User ID'
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const v = (e.target as HTMLInputElement).value.trim()
                        if (v) { setUserFilter(v); setUserInput(v) }
                      }
                    }}
                    className='w-full h-7 px-2 text-xs font-mono rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring'
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              <button
                type='button'
                onClick={() => { setUserFilter(''); setUserInput('') }}
                className='px-1.5 h-full flex items-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer'
              >
                <X className='w-3 h-3' />
              </button>
            </span>
          ) : (
            <Input
              placeholder='User ID'
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitUserFilter()
              }}
              className='w-40 h-7 text-sm'
            />
          )}
          {propFilters.map((f, i) => (
            <FilterChip
              key={i}
              filter={f}
              schema={schema}
              onRemove={() => removeFilter(i)}
              onUpdate={next => updateFilter(i, next)}
            />
          ))}
          <FilterBuilder schema={schema} schemaError={schemaError} onAdd={addFilter} />
        </div>
      </div>

      {/* Results */}
      {loading && events.length === 0 ? (
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      ) : error && events.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-16'>
          <AlertCircle className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>{error}</p>
          <Button variant='outline' size='sm' className='mt-2' onClick={() => fetchEvents()}>
            Retry
          </Button>
        </div>
      ) : events.length > 0 ? (
        <>
          <table className='w-full'>
            <thead>
              <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
                <th className='py-2 pr-2 text-left font-medium'>Time</th>
                <th className='py-2 pr-2 text-left font-medium'>Event</th>
                <th className='py-2 pr-2 text-left font-medium'>Location</th>
                <th className='py-2 pr-2 text-left font-medium'>Platform</th>
                <th className='py-2 pr-2 text-left font-medium'>Properties</th>
                <th className='py-2 pr-2 text-right font-medium'>User / Session</th>
                <th className='w-5' />
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <EventRow key={event.eventId} event={event} />
              ))}
            </tbody>
          </table>

          {error && (
            <div className='mt-4 mb-2 flex items-center justify-center gap-2 text-xs text-muted-foreground'>
              <AlertCircle className='w-3.5 h-3.5' />
              <span>{error}</span>
              <Button variant='outline' size='sm' className='h-6 text-xs' onClick={() => fetchEvents(nextToken)}>
                Retry
              </Button>
            </div>
          )}

          {!error && nextToken && (
            <div className='mt-4 mb-8'>
              <Button
                variant='outline'
                size='sm'
                className='w-full'
                onClick={() => fetchEvents(nextToken)}
                disabled={loading}
              >
                {loading ? <Loader2 className='animate-spin' /> : 'Load more events'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className='flex flex-col items-center justify-center py-16'>
          <List className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>No events found</p>
          <p className='text-xs text-muted-foreground'>Try adjusting filters or check a different time range</p>
        </div>
      )}
    </Page>
  )
}

export default EventExplorer
