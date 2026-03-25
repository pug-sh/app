import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import { formatRelative, useRelativeTime } from '@/hooks/use-relative-time'
import Page from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toggle } from '@/components/ui/toggle'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import ProjectLink from '@/components/project-link'
import { structGet, structToEntries } from '@/lib/struct'
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt'
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import { cn } from '@/lib/utils'
import { useAtomValue } from 'jotai'
import {
  Activity,
  Braces,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Globe,
  Loader2,
  Monitor,
  Smartphone,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'wouter'

// ── Helpers ─────────────────────────────────────────────────────────────────

const tsToDate = (ts: Timestamp | undefined): Date | null => {
  if (!ts) return null
  try {
    return timestampDate(ts)
  } catch {
    return null
  }
}

const formatDateHeader = (d: Date): string => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86_400_000)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (target.getTime() === today.getTime()) return 'Today'
  if (target.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const formatClock = (d: Date): string => {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

const COLOR_PALETTE = [
  { dot: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400' },
  { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  { dot: 'bg-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-400' },
  { dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400' },
  { dot: 'bg-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400' },
  { dot: 'bg-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-700 dark:text-cyan-400' },
  { dot: 'bg-pink-500', bg: 'bg-pink-500/10', text: 'text-pink-700 dark:text-pink-400' },
  { dot: 'bg-teal-500', bg: 'bg-teal-500/10', text: 'text-teal-700 dark:text-teal-400' },
]

const FIXED_KIND_COLORS: Record<string, number> = {
  click: 0,
  form_start: 1,
  form_submit: 2,
  rage_click: 4,
  dead_click: 6,
  page_view: 3,
  scroll: 5,
}

const hashString = (s: string): number => {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const kindStyle = (kind: string) => {
  if (kind in FIXED_KIND_COLORS) return COLOR_PALETTE[FIXED_KIND_COLORS[kind]]
  return COLOR_PALETTE[hashString(kind) % COLOR_PALETTE.length]
}

// ── Profile Summary ─────────────────────────────────────────────────────────

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
    <Card className='mb-5'>
      <CardContent className='pt-4'>
        <div className='flex items-start gap-4'>
          <div className='w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0'>
            <Activity className='w-5 h-5 text-primary' />
          </div>
          <div className='flex-1 min-w-0'>
            <p className='font-mono text-sm font-medium truncate'>{distinctId}</p>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground'>
              {firstSeen && (
                <span className='flex items-center gap-1'>
                  <Calendar className='w-3 h-3' />
                  First seen{' '}
                  <HoverSwap
                    primary={firstSeen.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    secondary={formatClock(firstSeen)}
                  />
                </span>
              )}
              {lastSeen && (
                <span className='flex items-center gap-1'>
                  <Clock className='w-3 h-3' />
                  Last seen{' '}
                  <HoverSwap
                    primary={lastSeenRelative}
                    secondary={lastSeen.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                </span>
              )}
              {(browser || os) && (
                <span className='flex items-center gap-1'>
                  {os?.toLowerCase().includes('android') || os?.toLowerCase().includes('ios') ? (
                    <Smartphone className='w-3 h-3' />
                  ) : (
                    <Monitor className='w-3 h-3' />
                  )}
                  {[browser, os].filter(Boolean).join(' / ')}
                </span>
              )}
              {(country || city) && (
                <span className='flex items-center gap-1'>
                  <Globe className='w-3 h-3' />
                  {[city, country].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
          <div className='flex gap-6 shrink-0 text-center'>
            <div>
              <p className='text-2xl font-semibold tabular-nums'>{events.length}</p>
              <p className='text-[10px] text-muted-foreground'>Events</p>
            </div>
            <div>
              <p className='text-2xl font-semibold tabular-nums'>{uniqueKinds}</p>
              <p className='text-[10px] text-muted-foreground'>Types</p>
            </div>
            <div>
              <p className='text-2xl font-semibold tabular-nums'>{uniqueSessions}</p>
              <p className='text-[10px] text-muted-foreground'>Sessions</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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


// ── Event Item ──────────────────────────────────────────────────────────────

const EventItem = ({ event, isToday }: { event: ActivityEvent; isToday: boolean }) => {
  const [expanded, setExpanded] = useState(false)
  const [jsonMode, setJsonMode] = useState(false)
  const d = tsToDate(event.occurTime)
  const autoProps = structToEntries(event.autoProperties)
  const customProps = structToEntries(event.customProperties)
  const inlineProps = customProps.slice(0, 3)
  const hasMore = autoProps.length > 0 || customProps.length > 3
  const colors = kindStyle(event.kind)

  return (
    <div className={cn('group relative pl-8 border-b border-border/50', hasMore && 'cursor-pointer')} onClick={() => hasMore && setExpanded(!expanded)}>
      <div className='absolute left-[11px] top-0 bottom-0 w-px bg-border' />
      <div
        className={cn(
          'absolute left-1.5 top-3.5 w-3 h-3 rounded-full border-2 border-background',
          colors.dot
        )}
      />

      <div className={cn('py-2.5 pr-3 transition-colors', hasMore && 'hover:bg-muted/40')}>
        <div className='flex items-center gap-2'>
          <Badge variant='secondary' className={cn('text-[11px] font-medium px-2 py-0.5', colors.bg, colors.text)}>
            {event.kind}
          </Badge>
          {d && (
            <span className='text-xs text-muted-foreground tabular-nums whitespace-nowrap w-12'>
              <HoverSwap
                primary={isToday ? formatRelative(d) : formatClock(d)}
                secondary={isToday ? formatClock(d) : formatRelative(d)}
              />
            </span>
          )}
          {inlineProps.length > 0 && (
            <div className='flex items-center gap-2 overflow-hidden'>
              {inlineProps.map(([k, v]) => (
                <span key={k} className='text-[11px] text-muted-foreground whitespace-nowrap'>
                  {k}: <span className='font-mono'>{v}</span>
                </span>
              ))}
            </div>
          )}
          {hasMore && (
            <span className='ml-auto'>
              {expanded ? (
                <ChevronDown className='w-3.5 h-3.5 text-muted-foreground' />
              ) : (
                <ChevronRight className='w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity' />
              )}
            </span>
          )}
        </div>

        {expanded && (
          <div className='mt-2 space-y-2' onClick={e => e.stopPropagation()}>
            <Toggle size='sm' pressed={jsonMode} onPressedChange={setJsonMode}>
              <Braces className='w-3.5 h-3.5' />
            </Toggle>
            {jsonMode ? (
              <pre className='text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all'>
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
              <>
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const UserActivity = () => {
  const { distinctId } = useParams<{ distinctId: string }>()
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const activityRPC = useAtomValue(activityRPCAtom)

  const [kindFilter, setKindFilter] = useState('')
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [nextToken, setNextToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const fetchEvents = useCallback(
    async (pageToken = '') => {
      if (!distinctId) return
      setLoading(true)
      try {
        const now = new Date()
        const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        const resp = await activityRPC.getActivityFeed(
          {
            distinctId,
            kind: kindFilter.trim() || undefined,
            timeRange: { from: timestampFromDate(from), to: timestampFromDate(now) },
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
      } finally {
        setLoading(false)
      }
    },
    [distinctId, kindFilter, headers, activityRPC]
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

  const uniqueKinds = useMemo(() => {
    const kinds: string[] = []
    const seen = new Set<string>()
    for (const e of events) {
      if (!seen.has(e.kind)) {
        seen.add(e.kind)
        kinds.push(e.kind)
      }
    }
    return kinds
  }, [events])

  if (!project) {
    return (
      <Page title='Activities'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <Activity className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select a project first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title='User Activity' description={distinctId}>
      {loading && events.length === 0 ? (
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      ) : events.length > 0 ? (
        <>
          <ProfileSummary distinctId={distinctId ?? ''} events={events} />

          <div className='flex items-center gap-2 mb-4'>
            <div className='flex flex-wrap gap-1.5'>
              {uniqueKinds.map(kind => (
                <span key={kind} className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
                  <span className={cn('w-2 h-2 rounded-full', kindStyle(kind).dot)} />
                  {kind}
                </span>
              ))}
            </div>
            <Button variant='outline' size='sm' className='ml-auto' onClick={() => setShowFilters(!showFilters)}>
              <Filter className='w-3.5 h-3.5' /> Filter
            </Button>
          </div>

          {showFilters && (
            <Card className='mb-4'>
              <div className='px-4 py-3 flex items-end gap-3'>
                <div className='space-y-1'>
                  <Label className='text-xs'>Event kind</Label>
                  <Input
                    placeholder='e.g. page_view'
                    value={kindFilter}
                    onChange={e => setKindFilter(e.target.value)}
                    className='w-48 h-7 text-sm'
                  />
                </div>
                <Button size='sm' onClick={() => fetchEvents()}>
                  Apply
                </Button>
              </div>
            </Card>
          )}

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
                  return (
                    <div key={event.eventId} className='flex'>
                      <div className='flex-1 min-w-0'>
                        <EventItem event={event} isToday={group.label === 'Today'} />
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

          {nextToken && (
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
          <p className='text-xs'>No activity for this user in the last 90 days</p>
        </div>
      )}
    </Page>
  )
}

export default UserActivity
