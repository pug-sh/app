import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import { EventDetails } from '@/components/event-details'
import HoverSwap from '@/components/hover-swap'
import { kindStyle } from '@/components/event-filters'
import Page from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import ProjectLink from '@/components/project-link'
import { structGet, structToEntries } from '@/lib/struct'
import { tsToDate, formatClock } from '@/lib/timestamp'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { cn } from '@/lib/utils'
import { useAtomValue } from 'jotai'
import { Calendar, ChevronDown, ChevronRight, Clock, Globe, Loader2, Monitor, Smartphone, Timer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'wouter'

// ── Helpers ─────────────────────────────────────────────────────────────────

const formatDuration = (ms: number): string => {
  if (ms < 1000) return '< 1s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

// ── Session Summary ─────────────────────────────────────────────────────────

const SessionSummary = ({
  sessionId,
  distinctId,
  events,
}: {
  sessionId: string
  distinctId: string
  events: ActivityEvent[]
}) => {
  const startTime = events.length > 0 ? tsToDate(events[events.length - 1].occurTime) : null
  const endTime = events.length > 0 ? tsToDate(events[0].occurTime) : null
  const duration = startTime && endTime ? endTime.getTime() - startTime.getTime() : 0
  const uniqueKinds = new Set(events.map(e => e.kind)).size

  const firstAuto = events.length > 0 ? events[events.length - 1].autoProperties : undefined
  const browser = structGet(firstAuto, '$browser')
  const browserVersion = structGet(firstAuto, '$browserVersion')
  const os = structGet(firstAuto, '$os')
  const osVersion = structGet(firstAuto, '$osVersion')
  const device = structGet(firstAuto, '$device')
  const country = structGet(firstAuto, '$country')
  const city = structGet(firstAuto, '$city')
  const ip = structGet(firstAuto, '$ip')

  const entryEvent = events.length > 0 ? events[events.length - 1].kind : null
  const exitEvent = events.length > 0 ? events[0].kind : null

  return (
    <div className='mb-5 pb-4 border-b border-border space-y-4'>
      {/* Header row */}
      <div className='flex items-start gap-4'>
          <div className='w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0'>
            <Timer className='w-5 h-5 text-violet-500' />
          </div>
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-2'>
              <p className='text-sm font-medium'>Session</p>
              <Badge variant='secondary' className='font-mono text-[10px]'>
                {sessionId.slice(0, 16)}
              </Badge>
            </div>
            <div className='flex items-center gap-1.5 mt-1'>
              <ProjectLink
                href={`/activities/${encodeURIComponent(distinctId)}`}
                className='text-xs text-primary font-mono hover:underline underline-offset-4'
              >
                {distinctId}
              </ProjectLink>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t'>
          <div>
            <p className='text-[10px] text-muted-foreground mb-0.5'>Duration</p>
            <p className='text-sm font-semibold tabular-nums'>{duration > 0 ? formatDuration(duration) : '—'}</p>
          </div>
          <div>
            <p className='text-[10px] text-muted-foreground mb-0.5'>Events</p>
            <p className='text-sm font-semibold tabular-nums'>{events.length}</p>
          </div>
          <div>
            <p className='text-[10px] text-muted-foreground mb-0.5'>Entry</p>
            <p className='text-sm font-medium truncate'>{entryEvent ?? '—'}</p>
          </div>
          <div>
            <p className='text-[10px] text-muted-foreground mb-0.5'>Exit</p>
            <p className='text-sm font-medium truncate'>{exitEvent ?? '—'}</p>
          </div>
        </div>

        {/* Time + device row */}
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
          {startTime && (
            <span className='flex items-center gap-1'>
              <Calendar className='w-3 h-3' />
              {startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},{' '}
              {startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
              {endTime && ` — ${endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
            </span>
          )}
          {(browser || os) && (
            <span className='flex items-center gap-1'>
              {os?.toLowerCase().includes('android') || os?.toLowerCase().includes('ios') ? (
                <Smartphone className='w-3 h-3' />
              ) : (
                <Monitor className='w-3 h-3' />
              )}
              {[
                browser && browserVersion ? `${browser} ${browserVersion}` : browser,
                os && osVersion ? `${os} ${osVersion}` : os,
                device,
              ]
                .filter(Boolean)
                .join(' / ')}
            </span>
          )}
          {(country || city) && (
            <span className='flex items-center gap-1'>
              <Globe className='w-3 h-3' />
              {[city, country].filter(Boolean).join(', ')}
              {ip && <span className='opacity-50'>({ip})</span>}
            </span>
          )}
          <span className='flex items-center gap-1'>
            <Clock className='w-3 h-3' />
            {uniqueKinds} event types
          </span>
        </div>
    </div>
  )
}

// ── Event Item (simplified for session — no session badges) ─────────────────

const EventItem = ({ event, elapsed }: { event: ActivityEvent; elapsed: string }) => {
  const [expanded, setExpanded] = useState(false)
  const d = tsToDate(event.occurTime)
  const autoProps = structToEntries(event.autoProperties)
  const customProps = structToEntries(event.customProperties)
  const inlineProps = customProps.slice(0, 3)
  const hasMore = autoProps.length > 0 || customProps.length > 3
  const colors = kindStyle(event.kind)

  return (
    <div
      className={cn('group relative pl-8 border-b border-border/50', hasMore && 'cursor-pointer')}
      onClick={() => hasMore && setExpanded(!expanded)}
    >
      <div className='absolute left-[11px] top-0 bottom-0 w-px bg-border' />
      <div
        className={cn('absolute left-1.5 top-3.5 w-3 h-3 rounded-full border-2 border-background', colors.dot)}
      />

      <div className={cn('py-2.5 pr-3 transition-colors', hasMore && 'hover:bg-muted/40')}>
        <div className='flex items-center gap-2'>
          <Badge variant='secondary' className={cn('text-[11px] font-medium px-2 py-0.5', colors.bg, colors.text)}>
            {event.kind}
          </Badge>
          {d && (
            <span className='text-xs text-muted-foreground tabular-nums whitespace-nowrap'>
              <HoverSwap primary={elapsed} secondary={formatClock(d)} />
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
          <div className='mt-2'>
            <EventDetails event={event} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const SessionView = () => {
  const { distinctId, sessionId } = useParams<{ distinctId: string; sessionId: string }>()
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const activityRPC = useAtomValue(activityRPCAtom)

  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)

  const fetchEvents = useCallback(async () => {
    if (!distinctId || !sessionId) return
    setLoading(true)
    try {
      const now = new Date()
      const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      const resp = await activityRPC.getActivityFeed(
        {
          distinctId,
          sessionId,
          timeRange: { from: timestampFromDate(from), to: timestampFromDate(now) },
          pageSize: 1000,
        },
        { headers }
      )
      setEvents(resp.events)
    } catch (err) {
      console.error('Session feed failed:', err)
    } finally {
      setLoading(false)
    }
  }, [distinctId, sessionId, headers, activityRPC])

  useEffect(() => {
    if (project && distinctId && sessionId) fetchEvents()
  }, [project, distinctId, sessionId, fetchEvents])

  // Compute elapsed time from session start for each event
  const sessionStart = events.length > 0 ? tsToDate(events[events.length - 1].occurTime) : null
  const elapsedTimes = useMemo(() => {
    if (!sessionStart) return events.map(() => '')
    // Events are newest-first, reverse for elapsed calculation
    return events.map(e => {
      const d = tsToDate(e.occurTime)
      if (!d) return ''
      const ms = d.getTime() - sessionStart.getTime()
      if (ms < 1000) return '+0s'
      const s = Math.floor(ms / 1000)
      if (s < 60) return `+${s}s`
      const m = Math.floor(s / 60)
      return `+${m}m${s % 60}s`
    })
  }, [events, sessionStart])

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
      <Page title='Session'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <Timer className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select a project first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title='Session' description={sessionId}>
      {loading ? (
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      ) : events.length > 0 ? (
        <>
          <SessionSummary sessionId={sessionId ?? ''} distinctId={distinctId ?? ''} events={events} />

          {/* Kind legend */}
          <div className='flex flex-wrap gap-1.5 mb-4'>
            {uniqueKinds.map(kind => (
              <span key={kind} className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
                <span className={cn('w-2 h-2 rounded-full', kindStyle(kind).dot)} />
                {kind}
              </span>
            ))}
          </div>

          {/* Session timeline */}
          {events.map((event, i) => (
            <EventItem key={event.eventId} event={event} elapsed={elapsedTimes[i]} />
          ))}
        </>
      ) : (
        <div className='flex flex-col items-center justify-center py-20 text-muted-foreground'>
          <Timer className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>No events found</p>
          <p className='text-xs'>This session has no recorded events</p>
        </div>
      )}
    </Page>
  )
}

export default SessionView
