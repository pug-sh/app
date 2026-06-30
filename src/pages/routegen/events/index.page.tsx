import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, ChevronDown, ChevronRight, List, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import { LocationLabel } from '@/components/country-flag'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import { EventDetails } from '@/components/event-details'
import { EventFilterBar, FilterBuilder, FilterChip } from '@/components/event-filters'
import { toProtoEventFilters, toProtoFilters } from '@/components/event-filters/filter-proto'
import HoverSwap from '@/components/hover-swap'
import { InlineEventProps } from '@/components/inline-event-props'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { PlatformLabel } from '@/components/platform-label'
import ProjectLink from '@/components/project-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useEventFilters } from '@/hooks/use-event-filters'
import { readFilterQueryParams, writeFilterQueryParams } from '@/hooks/use-filter-query-params'
import { useFilterState } from '@/hooks/use-filter-state'
import { useGlobalFilterSchema } from '@/hooks/use-global-filter-schema'
import { formatRelative } from '@/hooks/use-relative-time'
import { defaultRange } from '@/lib/date-presets'
import { getSeriesColor } from '@/lib/event-colors'
import { structGet, structToEntries } from '@/lib/struct'
import { formatDateTime, toProtoTimeRange, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { resolveInlineProps } from '@/lib/well-known-events'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from './filter-schema.atoms'

// ── Event Row ───────────────────────────────────────────────────────────────

const EventRow = ({ event }: { event: ActivityEvent }) => {
  const [expanded, setExpanded] = useState(false)
  const d = tsToDate(event.occurTime)
  const autoProps = structToEntries(event.autoProperties)
  const customProps = structToEntries(event.customProperties)
  const inlineResult = resolveInlineProps(event.kind, event.customProperties, event.autoProperties)
  const hasMore = autoProps.length > 0 || customProps.length > 3
  const colors = getSeriesColor(event.kind)
  const os = structGet(event.autoProperties, '$os')
  const osVersion = structGet(event.autoProperties, '$osVersion')
  const browser = structGet(event.autoProperties, '$browser')
  const browserVersion = structGet(event.autoProperties, '$browserVersion')
  const city = structGet(event.autoProperties, '$city')
  const country = structGet(event.autoProperties, '$country')
  const region = structGet(event.autoProperties, '$region')

  return (
    <>
      <tr
        className={cn(
          'group border-b border-border/50 transition-colors',
          hasMore && 'cursor-pointer hover:bg-muted/40',
        )}
        onClick={() => hasMore && setExpanded(!expanded)}
      >
        <td className="py-2.5 pr-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap align-middle">
          {d && <HoverSwap primary={formatRelative(d)} secondary={formatDateTime(d)} />}
        </td>
        <td className="py-2.5 pr-2 align-middle">
          <Badge
            variant="secondary"
            className="text-[11px] font-medium px-2 py-0.5"
            style={{ backgroundColor: colors.fill, color: colors.dot }}
          >
            {event.kind}
          </Badge>
        </td>
        <td className="pt-[0.8rem] pb-[0.45rem] pr-2 text-xs text-muted-foreground align-middle">
          {city || country ? (
            <LocationLabel city={city} region={region} country={country} flagSize={16} />
          ) : (
            <div className="truncate">—</div>
          )}
        </td>
        <td className="pt-[0.8rem] pb-[0.45rem] pr-2 text-xs text-muted-foreground align-middle">
          <PlatformLabel
            browser={browser}
            browserVersion={browserVersion}
            os={os}
            osVersion={osVersion}
            iconSize={14}
          />
        </td>
        <td className="py-2.5 pr-2 align-middle">
          <InlineEventProps {...inlineResult} />
        </td>
        <td className="py-2.5 pr-2 text-right whitespace-nowrap align-middle overflow-hidden">
          <ProjectLink
            href={`/profiles/${encodeURIComponent(event.distinctId)}/events`}
            onClick={e => e.stopPropagation()}
            className="text-xs font-mono text-link hover:underline underline-offset-4"
          >
            {event.distinctId}
          </ProjectLink>
          {event.sessionId && (
            <>
              <span className="text-muted-foreground/40"> / </span>
              <ProjectLink
                href={`/profiles/${encodeURIComponent(event.distinctId)}/sessions/${encodeURIComponent(event.sessionId)}`}
                onClick={e => e.stopPropagation()}
                className="text-xs font-mono text-link hover:underline underline-offset-4"
              >
                {event.sessionId.slice(0, 8)}
              </ProjectLink>
            </>
          )}
        </td>
        <td className="py-2.5 w-5 align-middle text-right">
          {hasMore &&
            (expanded ? (
              <ChevronDown className="inline w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="inline w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            ))}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="pb-3 pt-1">
            <EventDetails event={event} />
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
  const initialFilterState = useMemo(() => readFilterQueryParams(), [])
  useEffect(() => {
    if (initialFilterState.parseWarning) {
      toast.warning(initialFilterState.parseWarning, { id: 'filter-parse-warning' })
    }
  }, []) // Fire on mount; explicit toast id dedupes the StrictMode double-call in dev.

  // Applied filter state (drives API calls)
  const eventFilters = useEventFilters(initialFilterState.eventFilters)
  const [userFilter, setUserFilter] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(defaultRange)
  const { propFilters, addFilter, updateFilter, removeFilter } = useFilterState(initialFilterState.propFilters)
  const { schema: globalSchema, schemaError: globalSchemaError } = useGlobalFilterSchema({
    baseSchema: schema,
    baseSchemaError: schemaError,
    selectedEventKinds: eventFilters.entries.map(e => e.kind),
  })

  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [nextToken, setNextToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filterRef = useRef<HTMLDivElement>(null)
  const [filterH, setFilterH] = useState(0)
  useEffect(() => {
    const el = filterRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFilterH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fetch schema on project load
  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  useEffect(() => {
    writeFilterQueryParams(eventFilters.entries, propFilters)
  }, [eventFilters.entries, propFilters])

  const fetchEvents = useCallback(
    async (pageToken = '') => {
      setLoading(true)
      setError(null)
      try {
        const protoEvents = toProtoEventFilters(eventFilters.entries)
        const resp = await activityRPC.getEventExplorer(
          {
            distinctId: userFilter || undefined,
            timeRange: toProtoTimeRange(timeRange),
            propertyFilters: toProtoFilters(propFilters),
            events: protoEvents,
            pageSize: 100,
            pageToken,
          },
          { headers },
        )
        if (pageToken) {
          setEvents(prev => [...prev, ...resp.events])
        } else {
          setEvents(resp.events)
        }
        setNextToken(resp.nextPageToken)
      } catch (err) {
        console.error('Event explorer failed:', err)
        setError(
          err instanceof Error ? err.message : pageToken ? 'Failed to load more events' : 'Failed to load events',
        )
      } finally {
        setLoading(false)
      }
    },
    [activityRPC, headers, eventFilters.entries, userFilter, timeRange, propFilters],
  )

  useEffect(() => {
    if (project) fetchEvents()
  }, [project, fetchEvents])

  if (!project) return <NoProject title="Events" icon={List} />

  return (
    <Page title="Events" description="Browse raw events across all users">
      {/* Filter bar */}
      <div
        ref={filterRef}
        className="sticky top-0 z-10 bg-background -mx-8 px-8 pt-4 pb-3 space-y-2 border-b border-border/50"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={timeRange} onChange={setTimeRange} allowUnset />
        </div>
        <EventFilterBar
          filtersAtom={eventFilters.filtersAtom}
          events={schema?.events}
          schema={schema}
          schemaError={schemaError}
        />
        <div className="flex items-center gap-2 flex-wrap">
          {userFilter && (
            <span className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7">
              <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px]">user</span>
              <Popover>
                <PopoverTrigger className="px-2 h-full flex items-center font-mono hover:bg-muted/40 transition-colors">
                  {userFilter}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-52 p-2">
                  <input
                    defaultValue={userFilter}
                    placeholder="User ID"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const v = (e.target as HTMLInputElement).value.trim()
                        if (v) setUserFilter(v)
                      }
                    }}
                    className="w-full h-7 px-2 text-xs font-mono rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => setUserFilter('')}
                className="px-1.5 h-full flex items-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {propFilters.map((f, i) => (
            <FilterChip key={i} filter={f} onRemove={() => removeFilter(i)} onUpdate={next => updateFilter(i, next)} />
          ))}
          <FilterBuilder
            schema={globalSchema}
            schemaError={globalSchemaError}
            onAdd={addFilter}
            onUserIdSet={userFilter ? undefined : setUserFilter}
          />
          {events.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{events.length} events</span>
          )}
        </div>
      </div>

      {/* Results */}
      {loading && events.length === 0 ? (
        <LoadingSpinner />
      ) : error && events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchEvents()}>
            Retry
          </Button>
        </div>
      ) : events.length > 0 ? (
        <>
          <table className="w-full table-fixed">
            <thead className="sticky z-9 bg-background" style={{ top: filterH }}>
              <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <th className="py-2 pr-2 text-left font-medium w-24">Time</th>
                <th className="py-2 pr-2 text-left font-medium w-44">Event</th>
                <th className="py-2 pr-2 text-left font-medium w-32">Location</th>
                <th className="py-2 pr-2 text-left font-medium w-44">Platform</th>
                <th className="py-2 pr-2 text-left font-medium">Properties</th>
                <th className="py-2 pr-2 text-right font-medium w-36">User / Session</th>
                <th className="w-5" />
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <EventRow key={event.eventId} event={event} />
              ))}
            </tbody>
          </table>

          {error && (
            <div className="mt-4 mb-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{error}</span>
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => fetchEvents(nextToken)}>
                Retry
              </Button>
            </div>
          )}

          {!error && nextToken && (
            <div className="mt-4 mb-8">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fetchEvents(nextToken)}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Load more events'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16">
          <List className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">No events found</p>
          <p className="text-xs text-muted-foreground">Try adjusting filters or check a different time range</p>
        </div>
      )}
    </Page>
  )
}

export default EventExplorer
