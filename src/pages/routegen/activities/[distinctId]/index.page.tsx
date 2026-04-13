import type { ActivityEvent, HeatmapDay, ProfileStats } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import LoadingSpinner from '@/components/loading-spinner'
import TimelineEventItem from '@/components/timeline-event-item'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import { EventFilterBar, FilterBuilder, FilterChip } from '@/components/event-filters'
import { formatRelative } from '@/hooks/use-relative-time'
import { useEventFilters } from '@/hooks/use-event-filters'
import { useFilterState, toProtoFilters, toProtoEventFilters } from '@/hooks/use-filter-state'
import { useGlobalFilterSchema } from '@/hooks/use-global-filter-schema'
import { readFilterQueryParams, writeFilterQueryParams } from '@/hooks/use-filter-query-params'
import NoProject from '@/components/no-project'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
import {
  Activity,
  AlertCircle,
  Calendar,
  Clock,
  Globe,
  Loader2,
  Monitor,
  Smartphone,
} from 'lucide-react'
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

// ── Activity Heatmap ─────────────────────────────────────────────────────────

const CELL = 10 // px
const GAP = 2   // px

function buildHeatmapGrid(counts: Map<string, bigint>) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Align start to the Sunday ~9 weeks ago (covers ~2 months)
  const start = new Date(today)
  start.setDate(start.getDate() - 9 * 7)
  start.setDate(start.getDate() - start.getDay())

  const weeks: { date: Date; count: number }[][] = []
  const cur = new Date(start)

  while (cur <= today) {
    const week: { date: Date; count: number }[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(cur)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      week.push({ date, count: date > today ? -1 : Number(counts.get(key) ?? 0) })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }

  return weeks
}

const cellClass = (count: number) => {
  if (count < 0) return 'bg-transparent'
  if (count === 0) return 'bg-muted'
  if (count <= 2) return 'bg-primary/25'
  if (count <= 5) return 'bg-primary/50'
  if (count <= 10) return 'bg-primary/75'
  return 'bg-primary'
}

const ActivityHeatmap = ({ days }: { days: HeatmapDay[] }) => {
  const counts = useMemo(() => new Map(days.map(d => [d.date, d.count])), [days])
  const weeks = useMemo(() => buildHeatmapGrid(counts), [counts])

  const monthLabels = useMemo(() => {
    const labels: { label: string; col: number }[] = []
    let lastMonth = -1
    weeks.forEach((week, i) => {
      const month = week[0].date.getMonth()
      if (month !== lastMonth) {
        labels.push({ label: week[0].date.toLocaleDateString('en-US', { month: 'short' }), col: i })
        lastMonth = month
      }
    })
    return labels
  }, [weeks])

  const numWeeks = weeks.length

  return (
    <div>
      {/* Month labels — same grid as cells so columns align */}
      <div
        className='mb-1'
        style={{ display: 'grid', gridTemplateColumns: `repeat(${numWeeks}, 1fr)`, gap: GAP }}
      >
        {weeks.map((_week, wi) => {
          const label = monthLabels.find(l => l.col === wi)
          return (
            <div key={wi} className='text-[8px] text-muted-foreground truncate'>
              {label?.label ?? ''}
            </div>
          )
        })}
      </div>
      {/* Cell grid: column-major (each column = one week, rows = days) */}
      <TooltipProvider>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${numWeeks}, 1fr)`,
            gridTemplateRows: `repeat(7, ${CELL}px)`,
            gridAutoFlow: 'column',
            gap: GAP,
          }}
        >
          {weeks.flat().map((day, i) =>
            day.count >= 0 ? (
              <Tooltip key={i}>
                <TooltipTrigger render={<div />} className={cn('rounded-sm cursor-default', cellClass(day.count))} />
                <TooltipContent>
                  {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' · '}
                  {day.count} event{day.count !== 1 ? 's' : ''}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div key={i} className='rounded-sm bg-transparent' />
            )
          )}
        </div>
      </TooltipProvider>
    </div>
  )
}

// ── User Profile Sidebar ─────────────────────────────────────────────────────

const UserProfileSidebar = ({ distinctId }: { distinctId: string }) => {
  const activityRPC = useAtomValue(activityRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [stats, setStats] = useState<ProfileStats | undefined>(undefined)
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([])

  useEffect(() => {
    activityRPC.getProfileStats({ distinctId }, { headers })
      .then(resp => { setStats(resp.stats); setHeatmap(resp.heatmap) })
      .catch(() => {})
  }, [distinctId, activityRPC, headers])

  const firstSeen = stats?.firstSeen ? tsToDate(stats.firstSeen) : null
  const lastSeen = stats?.lastSeen ? tsToDate(stats.lastSeen) : null
  const browser = stats?.browser ?? ''
  const os = stats?.os ?? ''
  const country = stats?.country ?? ''
  const city = stats?.city ?? ''

  return (
    <aside className='w-80 shrink-0 border-l border-border overflow-y-auto'>
      <div className='p-5 space-y-5'>

        {/* Identity */}
        <div>
          <p className='font-mono text-xs truncate text-muted-foreground'>{distinctId}</p>
          <div className='flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground'>
            {(country || city) && (
              <span className='flex items-center gap-1'>
                <Globe className='w-3 h-3 shrink-0' />
                {[city, country].filter(Boolean).join(', ')}
              </span>
            )}
            {(browser || os) && (
              <span className='flex items-center gap-1'>
                {isMobileOS(os) ? <Smartphone className='w-3 h-3 shrink-0' /> : <Monitor className='w-3 h-3 shrink-0' />}
                {[os, browser].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className='flex gap-5'>
            <div>
              <p className='text-xl font-semibold tabular-nums'>{stats.totalEvents.toString()}</p>
              <p className='text-[10px] text-muted-foreground'>Events</p>
            </div>
          </div>
        )}

        {/* First / last seen */}
        {(firstSeen || lastSeen) && (
          <div>
            <div className='flex items-center gap-2 mb-2'>
              <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Timeline</span>
              <div className='flex-1 h-px bg-border' />
            </div>
            <div className='space-y-1.5 text-xs'>
              {firstSeen && (
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-muted-foreground flex items-center gap-1.5 shrink-0'>
                    <Calendar className='w-3 h-3' /> First seen
                  </span>
                  <span className='font-mono'>
                    <HoverSwap primary={formatDateTime(firstSeen)} secondary={formatRelative(firstSeen)} />
                  </span>
                </div>
              )}
              {lastSeen && (
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-muted-foreground flex items-center gap-1.5 shrink-0'>
                    <Clock className='w-3 h-3' /> Last seen
                  </span>
                  <span className='font-mono'>
                    <HoverSwap primary={formatDateTime(lastSeen)} secondary={formatRelative(lastSeen)} />
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity heatmap */}
        <div>
          <div className='flex items-center gap-2 mb-3'>
            <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Activity</span>
            <div className='flex-1 h-px bg-border' />
          </div>
          <ActivityHeatmap days={heatmap} />
        </div>

      </div>
    </aside>
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
  useEffect(() => { if (initialFilterState.parseWarning) toast.warning(initialFilterState.parseWarning) }, []) // eslint-disable-line react-hooks/exhaustive-deps -- fire once on mount

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

  if (!project) return <NoProject title='Activities' icon={Activity} />

  return (
    <div className='flex flex-1 overflow-hidden' style={{ height: 'calc(100svh - 3rem)' }}>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <div className='flex-1 min-w-0 overflow-y-auto p-8'>
        {loading && events.length === 0 ? (
          <LoadingSpinner />
        ) : error && events.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-16'>
            <Activity className='w-10 h-10 mb-4 opacity-15' />
            <p className='text-sm font-medium mb-1'>{error}</p>
            <Button variant='outline' size='sm' className='mt-2' onClick={() => fetchEvents()}>
              Retry
            </Button>
          </div>
        ) : events.length > 0 ? (
          <>
            <div className='sticky top-0 z-10 bg-background -mx-8 px-8 pb-3 space-y-2 border-b border-border/50'>
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

            <div className='pt-4'>
            {groupedEvents.map(group => {
              const lanes = computeSessionLanes(group.events)
              const maxCol = lanes.length > 0 ? Math.max(...lanes.map(l => l.column)) + 1 : 0

              return (
                <div key={group.label} className='mb-4'>
                  <div className='flex items-center gap-2 mb-2'>
                    <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
                      {group.label}
                    </span>
                    <div className='flex-1 h-px bg-border' />
                    <span className='text-[10px] text-muted-foreground'>{group.events.length} events</span>
                  </div>
                  {group.events.map((event, i) => {
                    const activeLanes = lanes.filter(l => i >= l.firstIdx && i <= l.lastIdx)
                    const d = tsToDate(event.occurTime)
                    const isToday = group.label === 'Today'
                    return (
                      <div key={event.eventId} className='flex'>
                        <div className='flex-1 min-w-0'>
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
                          <div className='relative shrink-0' style={{ width: maxCol * LANE_W }}>
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
                                      className='absolute border-l border-dashed border-muted-foreground/15 top-0 bottom-0'
                                      style={{ left: x + 1 }}
                                    />
                                  )}
                                  {isMid && (
                                    <div
                                      className='absolute top-1/2 -translate-y-1/2 flex flex-col gap-0.5'
                                      style={{ left: x + 10 }}
                                    >
                                      <ProjectLink
                                        href={`/activities/${encodeURIComponent(distinctId!)}/${encodeURIComponent(lane.sessionId)}`}
                                        className='text-[10px] font-mono text-primary hover:underline underline-offset-4 whitespace-nowrap'
                                      >
                                        {lane.sessionId.slice(0, 8)}
                                      </ProjectLink>
                                      {lane.platform && (
                                        <span className='text-[9px] text-muted-foreground/60 whitespace-nowrap'>
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
            </div>

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
              <div className='mb-8'>
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
          <div className='flex flex-col items-center justify-center py-20 text-muted-foreground'>
            <Activity className='w-10 h-10 mb-4 opacity-15' />
            <p className='text-sm font-medium mb-1'>No events found</p>
            <p className='text-xs'>No activity for this user</p>
          </div>
        )}
      </div>

      {/* ── Profile Sidebar ───────────────────────────────────────────── */}
      <UserProfileSidebar distinctId={distinctId ?? ''} />

    </div>
  )
}

export default UserActivity
