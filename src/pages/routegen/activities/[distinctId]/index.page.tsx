import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import LoadingSpinner from '@/components/loading-spinner'
import TimelineEventItem from '@/components/timeline-event-item'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import { EventFilterBar, FilterBuilder, FilterChip } from '@/components/event-filters'
import { formatRelative, useRelativeTime } from '@/hooks/use-relative-time'
import { useEventFilters } from '@/hooks/use-event-filters'
import { useFilterState, toProtoFilters, toProtoEventFilters } from '@/hooks/use-filter-state'
import { useGlobalFilterSchema } from '@/hooks/use-global-filter-schema'
import { readFilterQueryParams, writeFilterQueryParams } from '@/hooks/use-filter-query-params'
import Page from '@/components/layout/page'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../../events/filter-schema.atoms'
import ProjectLink from '@/components/project-link'
import { isMobileOS } from '@/lib/format'
import { structGet } from '@/lib/struct'
import { tsToDate, formatClock, formatDateTime, toProtoTimeRange } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAtomValue, useSetAtom } from 'jotai'
import { Activity, AlertCircle, Calendar, Clock, Globe, Loader2, Monitor, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'wouter'

// ── Helpers ─────────────────────────────────────────────────────────────────

const formatDateHeader = (d: Date) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86_400_000)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (target.getTime() === today.getTime()) return 'Today'
  if (target.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// ── Profile Summary ─────────────────────────────────────────────────────────

// Events are sorted newest-first from the API
const ProfileSummary = ({ distinctId, events }: { distinctId: string; events: ActivityEvent[] }) => {
  const firstSeen = events.length > 0 ? tsToDate(events[events.length - 1].occurTime) : null
  const lastSeen = events.length > 0 ? tsToDate(events[0].occurTime) : null
  const lastSeenRelative = useRelativeTime(lastSeen)
  const uniqueKinds = new Set(events.map(e => e.kind)).size
  const uniqueSessions = new Set(events.filter(e => e.sessionId).map(e => e.sessionId)).size
  const lastAuto = events.length > 0 ? events[0].autoProperties : undefined
  const browser = structGet(lastAuto, '$browser')
  const os = structGet(lastAuto, '$os')
  const country = structGet(lastAuto, '$country')
  const city = structGet(lastAuto, '$city')

  return (
    <div className="mb-5 pb-4 border-b border-border">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm font-medium truncate">{distinctId}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            {firstSeen && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                First seen <HoverSwap primary={formatDateTime(firstSeen)} secondary={formatRelative(firstSeen)} />
              </span>
            )}
            {lastSeen && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last seen <HoverSwap primary={formatDateTime(lastSeen)} secondary={lastSeenRelative} />
              </span>
            )}
            {(browser || os) && (
              <span className="flex items-center gap-1">
                {isMobileOS(os) ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                {[browser, os].filter(Boolean).join(' / ')}
              </span>
            )}
            {(country || city) && (
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {[city, country].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-6 shrink-0 text-center">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{events.length}</p>
            <p className="text-[10px] text-muted-foreground">Events</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{uniqueKinds}</p>
            <p className="text-[10px] text-muted-foreground">Types</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{uniqueSessions}</p>
            <p className="text-[10px] text-muted-foreground">Sessions</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Session Lanes ───────────────────────────────────────────────────────────

type SessionLane = {
  sessionId: string
  firstIdx: number
  lastIdx: number
  column: number
  platform: string
}

const LANE_W = 80

/** Assigns each session to a lane (column) so overlapping sessions don't share a column. Greedy first-fit. */
function computeSessionLanes(events: ActivityEvent[]): SessionLane[] {
  const ranges = new Map<string, { first: number; last: number }>()
  events.forEach((e, i) => {
    if (!e.sessionId) return
    const r = ranges.get(e.sessionId)
    if (r) r.last = i
    else ranges.set(e.sessionId, { first: i, last: i })
  })

  const lanes: SessionLane[] = []
  for (const [sid, range] of ranges) {
    let col = 0
    while (lanes.some(l => l.column === col && range.first <= l.lastIdx && range.last >= l.firstIdx)) {
      col++
    }
    const auto = events[range.first].autoProperties
    const platform = [structGet(auto, '$browser'), structGet(auto, '$os')].filter(Boolean).join(' / ')
    lanes.push({ sessionId: sid, firstIdx: range.first, lastIdx: range.last, column: col, platform })
  }
  return lanes
}

// ── Main Component ──────────────────────────────────────────────────────────

const UserActivity = () => {
  const { distinctId } = useParams<{ distinctId: string }>()
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- fire on mount; explicit toast id dedupes the StrictMode double-call in dev

  const eventFilters = useEventFilters(initialFilterState.eventFilters)
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(undefined)
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

  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  useEffect(() => {
    writeFilterQueryParams(eventFilters.entries, propFilters)
  }, [eventFilters.entries, propFilters])

  const fetchEvents = useCallback(
    async (pageToken = '') => {
      if (!distinctId) return
      setLoading(true)
      setError(null)
      try {
        const protoEvents = toProtoEventFilters(eventFilters.entries)
        const resp = await activityRPC.getActivityFeed(
          {
            distinctId,
            timeRange: toProtoTimeRange(timeRange),
            propertyFilters: toProtoFilters(propFilters),
            events: protoEvents,
            pageSize: 200,
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
        console.error('Activity feed failed:', err)
        setError(err instanceof Error ? err.message : 'Failed to load activity feed')
      } finally {
        setLoading(false)
      }
    },
    [distinctId, eventFilters.entries, timeRange, propFilters, headers, activityRPC]
  )

  useEffect(() => {
    if (project && distinctId) fetchEvents()
  }, [project, distinctId, fetchEvents])

  const groupedEvents = useMemo(() => {
    const groups: { label: string; events: ActivityEvent[] }[] = []
    let currentLabel = ''
    for (const event of events) {
      const d = tsToDate(event.occurTime)
      const label = d ? formatDateHeader(d) : 'Unknown'
      if (label !== currentLabel) {
        currentLabel = label
        groups.push({ label, events: [] })
      }
      groups[groups.length - 1].events.push(event)
    }
    return groups
  }, [events])

  if (!project) return <NoProject title="Activities" icon={Activity} />

  return (
    <Page title="User Activity" description={distinctId}>
      {loading && events.length === 0 ? (
        <LoadingSpinner />
      ) : error && events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Activity className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchEvents()}>
            Retry
          </Button>
        </div>
      ) : events.length > 0 ? (
        <>
          <ProfileSummary distinctId={distinctId ?? ''} events={events} />

          <div className="sticky top-0 z-10 bg-background -mx-8 px-8 pt-4 pb-3 space-y-2 border-b border-border/50">
            <div className="flex flex-wrap items-center gap-2">
              <DateRangePicker value={timeRange} onChange={setTimeRange} allowUnset />
            </div>
            <EventFilterBar
              filtersAtom={eventFilters.filtersAtom}
              events={schema?.events}
              schema={schema}
              schemaError={schemaError}
            />
            <div className="flex flex-wrap items-center gap-2">
              {propFilters.map((f, i) => (
                <FilterChip
                  key={i}
                  filter={f}
                  schema={globalSchema}
                  onRemove={() => removeFilter(i)}
                  onUpdate={next => updateFilter(i, next)}
                />
              ))}
              <FilterBuilder schema={globalSchema} schemaError={globalSchemaError} onAdd={addFilter} />
            </div>
          </div>

          {groupedEvents.map(group => {
            const lanes = computeSessionLanes(group.events)
            const maxCol = lanes.length > 0 ? Math.max(...lanes.map(l => l.column)) + 1 : 0

            return (
              <div key={group.label} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">{group.events.length} events</span>
                </div>
                {group.events.map((event, i) => {
                  const activeLanes = lanes.filter(l => i >= l.firstIdx && i <= l.lastIdx)
                  const d = tsToDate(event.occurTime)
                  const isToday = group.label === 'Today'
                  return (
                    <div key={event.eventId} className="flex">
                      <div className="flex-1 min-w-0">
                        <TimelineEventItem
                          event={event}
                          timeLabel={
                            d
                              ? {
                                  primary: isToday ? formatRelative(d) : formatClock(d),
                                  secondary: isToday ? formatClock(d) : formatRelative(d),
                                }
                              : null
                          }
                        />
                      </div>
                      {maxCol > 0 && (
                        <div className="relative shrink-0" style={{ width: maxCol * LANE_W }}>
                          {activeLanes.map(lane => {
                            const isFirst = i === lane.firstIdx
                            const isLast = i === lane.lastIdx
                            const belongs = event.sessionId === lane.sessionId
                            const midIdx = Math.floor((lane.firstIdx + lane.lastIdx) / 2)
                            const isMid = i === midIdx
                            const x = lane.column * LANE_W
                            return (
                              <div key={lane.sessionId}>
                                {belongs ? (
                                  <div
                                    className={cn(
                                      'absolute w-[3px] bg-muted-foreground/40',
                                      isFirst && isLast && 'top-1.5 bottom-1.5 rounded-full',
                                      isFirst && !isLast && 'top-1.5 bottom-0 rounded-t-full',
                                      !isFirst && isLast && 'top-0 bottom-1.5 rounded-b-full',
                                      !isFirst && !isLast && 'top-0 bottom-0'
                                    )}
                                    style={{ left: x }}
                                  />
                                ) : (
                                  <div
                                    className="absolute border-l border-dashed border-muted-foreground/15 top-0 bottom-0"
                                    style={{ left: x + 1 }}
                                  />
                                )}
                                {isMid && (
                                  <div
                                    className="absolute top-1/2 -translate-y-1/2 flex flex-col gap-0.5"
                                    style={{ left: x + 10 }}
                                  >
                                    <ProjectLink
                                      href={`/activities/${encodeURIComponent(distinctId!)}/${encodeURIComponent(lane.sessionId)}`}
                                      className="text-[10px] font-mono text-primary hover:underline underline-offset-4 whitespace-nowrap"
                                    >
                                      {lane.sessionId.slice(0, 8)}
                                    </ProjectLink>
                                    {lane.platform && (
                                      <span className="text-[9px] text-muted-foreground/60 whitespace-nowrap">
                                        {lane.platform}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

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
            <div className="mb-8">
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
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Activity className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">No events found</p>
          <p className="text-xs">No activity for this user</p>
        </div>
      )}
    </Page>
  )
}

export default UserActivity
