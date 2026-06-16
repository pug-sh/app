import { useAtomValue } from 'jotai'
import { Calendar, Clock, Timer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'wouter'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import { LocationLabel } from '@/components/country-flag'
import { DetailTooltip, tooltipPanelContent } from '@/components/detail-tooltip'
import { Devicon } from '@/components/devicon'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { PlatformTooltip } from '@/components/platform-label'
import ProjectLink from '@/components/project-link'
import TimelineEventItem from '@/components/timeline-event-item'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { resolveBrowserDevicon, resolveDeviceDevicon, resolveOsDevicon } from '@/lib/devicon-map'
import { getSeriesColor } from '@/lib/event-colors'
import { structGet } from '@/lib/struct'
import { formatClock, formatDateTime, tsToDate } from '@/lib/timestamp'

// ── Helpers ─────────────────────────────────────────────────────────────────

const formatDuration = (ms: number) => {
  if (ms < 1000) return '< 1s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

// ── Session Summary ─────────────────────────────────────────────────────────
// Events are sorted newest-first from the API

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
  const region = structGet(firstAuto, '$region')
  const ip = structGet(firstAuto, '$ip')

  const entryEvent = events.length > 0 ? events[events.length - 1].kind : null
  const exitEvent = events.length > 0 ? events[0].kind : null
  const browserIcon = resolveBrowserDevicon(browser)
  const osIcon = resolveOsDevicon(os)
  const deviceIcon = !browser && !os ? resolveDeviceDevicon(device, os) : null

  return (
    <div className="mb-5 pb-4 border-b border-border space-y-4">
      {/* Header row */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
          <Timer className="w-5 h-5 text-violet-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Session</p>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {sessionId.slice(0, 16)}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <ProjectLink
              href={`/profiles/${encodeURIComponent(distinctId)}/events`}
              className="text-xs text-primary font-mono hover:underline underline-offset-4"
            >
              {distinctId}
            </ProjectLink>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t">
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Duration</p>
          <p className="text-sm font-medium tabular-nums">{duration > 0 ? formatDuration(duration) : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Events</p>
          <p className="text-sm font-medium tabular-nums">{events.length}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Entry</p>
          <p className="text-sm font-medium truncate">{entryEvent ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Exit</p>
          <p className="text-sm font-medium truncate">{exitEvent ?? '—'}</p>
        </div>
      </div>

      {/* Time + device row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {startTime && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDateTime(startTime)}
            {endTime && ` — ${formatClock(endTime)}`}
          </span>
        )}
        {(browser || os || device) && (
          <DetailTooltip
            detail={
              <PlatformTooltip
                browser={browser}
                browserVersion={browserVersion}
                os={os}
                osVersion={osVersion}
                device={device}
              />
            }
            contentClassName={tooltipPanelContent}
            className="min-w-0 items-center gap-1.5"
          >
            {browserIcon && <Devicon name={browserIcon} size={14} />}
            {osIcon && <Devicon name={osIcon} size={14} />}
            {deviceIcon && <Devicon name={deviceIcon} size={14} />}
            {[
              browser && browserVersion ? `${browser} ${browserVersion}` : browser,
              os && osVersion ? `${os} ${osVersion}` : os,
              device,
            ]
              .filter(Boolean)
              .join(' / ')}
          </DetailTooltip>
        )}
        {(country || city) && (
          <LocationLabel
            city={city}
            region={region}
            country={country}
            suffix={ip ? <span className="opacity-50">({ip})</span> : undefined}
          />
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {uniqueKinds} event types
        </span>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const SessionView = () => {
  const { profileId, sessionId } = useParams<{ profileId: string; sessionId: string }>()
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const activityRPC = useAtomValue(activityRPCAtom)

  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    if (!profileId || !sessionId) return
    setLoading(true)
    setError(null)
    try {
      const resp = await activityRPC.getActivityFeed(
        {
          distinctId: profileId,
          sessionId,
          pageSize: 1000,
        },
        { headers },
      )
      setEvents(resp.events)
    } catch (err) {
      console.error('Session feed failed:', err)
      setError('Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [profileId, sessionId, headers, activityRPC])

  useEffect(() => {
    if (project && profileId && sessionId) fetchEvents()
  }, [project, profileId, sessionId, fetchEvents])

  // Compute elapsed time from session start for each event.
  // Events are sorted newest-first from the API, so the last element is the oldest (session start).
  const sessionStart = events.length > 0 ? tsToDate(events[events.length - 1].occurTime) : null
  const elapsedTimes = useMemo(() => {
    if (!sessionStart) return events.map(() => '')
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

  if (!project) return <NoProject title="Session" icon={Timer} />

  return (
    <>
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Timer className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchEvents()}>
            Retry
          </Button>
        </div>
      ) : events.length > 0 ? (
        <>
          <SessionSummary sessionId={sessionId ?? ''} distinctId={profileId ?? ''} events={events} />

          {/* Kind legend — sticky */}
          <div className="sticky top-0 z-10 bg-background -mx-8 px-8 py-3 border-b border-border/50 flex flex-wrap gap-1.5">
            {uniqueKinds.map(kind => (
              <span key={kind} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getSeriesColor(kind).dot }} />
                {kind}
              </span>
            ))}
          </div>

          {/* Session timeline */}
          {events.map((event, i) => {
            const d = tsToDate(event.occurTime)
            return (
              <TimelineEventItem
                key={event.eventId}
                event={event}
                timeLabel={d ? { primary: elapsedTimes[i], secondary: formatClock(d) } : null}
              />
            )
          })}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Timer className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm font-medium mb-1">No events found</p>
          <p className="text-xs">This session has no recorded events</p>
        </div>
      )}
    </>
  )
}

export default SessionView
