import { useAtomValue } from 'jotai'
import { AlertCircle, User } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'wouter'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import ProjectLink from '@/components/project-link'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { formatRelative } from '@/hooks/use-relative-time'
import { toastRPCError } from '@/lib/rpc-error'
import { structGet } from '@/lib/struct'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'

type SessionRow = {
  sessionId: string
  startedAt: Date
  endedAt: Date
  events: number
  device: string
}

const groupSessions = (events: ActivityEvent[]) => {
  const buckets = new Map<string, ActivityEvent[]>()
  for (const e of events) {
    if (!e.sessionId) continue
    const existing = buckets.get(e.sessionId)
    if (existing) existing.push(e)
    else buckets.set(e.sessionId, [e])
  }
  const rows: SessionRow[] = []
  for (const [sessionId, evs] of buckets) {
    // events arrive newest-first from getActivityFeed
    const startedAt = tsToDate(evs[evs.length - 1].occurTime)
    const endedAt = tsToDate(evs[0].occurTime)
    if (!startedAt || !endedAt) continue
    const browser = structGet(evs[evs.length - 1].autoProperties, '$browser')
    const os = structGet(evs[evs.length - 1].autoProperties, '$os')
    rows.push({
      sessionId,
      startedAt,
      endedAt,
      events: evs.length,
      device: [browser, os].filter(Boolean).join(' · '),
    })
  }
  return rows
}

const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

type SortKey = 'started' | 'duration' | 'events'

const ProfileSessions = () => {
  const { profileId } = useParams<{ profileId: string }>()
  const project = useAtomValue(activeProjectAtom)
  if (!project) return <NoProject title="Profile" icon={User} />
  if (!profileId) return null
  return <SessionsBody profileId={profileId} />
}

const SessionsBody = ({ profileId }: { profileId: string }) => {
  const activityRPC = useAtomValue(activityRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('started')

  useEffect(() => {
    if (!headers) return
    let cancelled = false
    setLoading(true)
    setError(null)
    activityRPC
      .getActivityFeed({ distinctId: profileId, pageSize: 200, pageToken: '' }, { headers })
      .then(resp => {
        if (!cancelled) setEvents(resp.events)
      })
      .catch(err => {
        if (cancelled) return
        toastRPCError(err, 'Failed to load sessions')
        setError(err instanceof Error ? err.message : 'Failed to load sessions')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profileId, headers, activityRPC, reloadKey])

  const rows = useMemo(() => {
    const grouped = groupSessions(events)
    if (sortKey === 'duration') {
      grouped.sort(
        (a, b) => b.endedAt.getTime() - b.startedAt.getTime() - (a.endedAt.getTime() - a.startedAt.getTime()),
      )
    } else if (sortKey === 'events') {
      grouped.sort((a, b) => b.events - a.events)
    } else {
      grouped.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    }
    return grouped
  }, [events, sortKey])

  if (loading) return <LoadingSpinner />
  if (error && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="w-10 h-10 mb-4 opacity-15" />
        <p className="text-sm font-medium mb-1">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setReloadKey(k => k + 1)}>
          Retry
        </Button>
      </div>
    )
  }
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No sessions yet for this profile.</p>

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className={cn(
        'py-2 pr-4 text-left font-medium cursor-pointer hover:text-foreground',
        sortKey === k && 'text-foreground',
      )}
      onClick={() => setSortKey(k)}
    >
      {label}
      {sortKey === k && <span className="ml-1">↓</span>}
    </th>
  )

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          <th className="py-2 pr-4 text-left font-medium">Session</th>
          <SortHeader k="started" label="Started" />
          <SortHeader k="duration" label="Duration" />
          <SortHeader k="events" label="Events" />
          <th className="py-2 pr-4 text-left font-medium">Device</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.sessionId} className="border-b border-border/50 transition-colors hover:bg-muted/40">
            <td className="py-2.5 pr-4">
              <ProjectLink
                href={`/profiles/${encodeURIComponent(profileId)}/sessions/${encodeURIComponent(r.sessionId)}`}
                className="text-xs font-mono text-primary hover:underline underline-offset-4"
              >
                {r.sessionId.slice(0, 8)}
              </ProjectLink>
            </td>
            <td className="py-2.5 pr-4 text-xs text-muted-foreground tabular-nums">
              <HoverSwap primary={formatDateTime(r.startedAt)} secondary={formatRelative(r.startedAt)} />
            </td>
            <td className="py-2.5 pr-4 text-xs text-muted-foreground tabular-nums">
              {formatDuration(r.endedAt.getTime() - r.startedAt.getTime())}
            </td>
            <td className="py-2.5 pr-4 text-xs text-muted-foreground tabular-nums">{r.events}</td>
            <td className="py-2.5 pr-4 text-xs text-muted-foreground">{r.device || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default ProfileSessions
