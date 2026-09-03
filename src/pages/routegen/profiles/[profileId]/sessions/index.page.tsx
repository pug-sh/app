import { useAtomValue } from 'jotai'
import { AlertCircle, Loader2, User } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProfileSession } from '@/api/genproto/shared/activity/v1/activity_pb'
import { ProfileSessionSort } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { PlatformLabel } from '@/components/platform-label'
import ProjectLink from '@/components/project-link'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { formatRelative } from '@/hooks/use-relative-time'
import { useRouteParams } from '@/lib/route-params'
import { rpcErrorMessage, toastRPCError } from '@/lib/rpc-error'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'

const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

type SortKey = 'started' | 'duration' | 'events'

const SORTS: Record<SortKey, ProfileSessionSort> = {
  started: ProfileSessionSort.STARTED_AT,
  duration: ProfileSessionSort.DURATION,
  events: ProfileSessionSort.EVENT_COUNT,
}

const ProfileSessions = () => {
  const { profileId } = useRouteParams<{ profileId: string }>()
  const project = useAtomValue(activeProjectAtom)
  if (!project) return <NoProject title="Profile" icon={User} />
  if (!profileId) return null
  return <SessionsBody profileId={profileId} />
}

const SessionsBody = ({ profileId }: { profileId: string }) => {
  const activityRPC = useAtomValue(activityRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [sessions, setSessions] = useState<ProfileSession[]>([])
  const [nextToken, setNextToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; pageToken: string } | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('started')
  const requestRef = useRef(0)

  const fetchSessions = useCallback(
    async (pageToken = '') => {
      setLoading(true)
      setError(null)
      const seq = ++requestRef.current
      try {
        const resp = await activityRPC.getProfileSessions(
          { distinctId: profileId, pageSize: 100, pageToken, sort: SORTS[sortKey], includeBots: true },
          { headers },
        )
        // A sort change re-issues while the previous request is in flight, and a stale answer
        // landing last would store its cursor under the new sort's header.
        if (seq !== requestRef.current) return
        setSessions(prev => (pageToken ? [...prev, ...resp.sessions] : resp.sessions))
        setNextToken(resp.nextPageToken)
      } catch (err) {
        if (seq !== requestRef.current) return
        toastRPCError(err, 'Failed to load sessions')
        setError({ message: rpcErrorMessage(err, 'Failed to load sessions'), pageToken })
      } finally {
        if (seq === requestRef.current) setLoading(false)
      }
    },
    [profileId, headers, activityRPC, sortKey],
  )

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  if (loading && sessions.length === 0) return <LoadingSpinner />
  if (error && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="w-10 h-10 mb-4 opacity-15" />
        <p className="text-sm font-medium mb-1">{error.message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchSessions()}>
          Retry
        </Button>
      </div>
    )
  }
  if (sessions.length === 0) return <p className="text-xs text-muted-foreground">No sessions yet for this profile.</p>

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
    <>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <th className="py-2 pr-4 text-left font-medium">Session</th>
            <SortHeader k="started" label="Started" />
            <SortHeader k="duration" label="Duration" />
            <SortHeader k="events" label="Events" />
            <th className="py-2 pr-4 text-left font-medium">Device</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => {
            const startedAt = tsToDate(s.startedAt)
            const endedAt = tsToDate(s.endedAt)
            return (
              <tr key={s.sessionId} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                <td className="py-2.5 pr-4">
                  <ProjectLink
                    href={`/profiles/${encodeURIComponent(profileId)}/sessions/${encodeURIComponent(s.sessionId)}`}
                    className="text-xs font-mono text-link hover:underline underline-offset-4"
                  >
                    {s.sessionId.slice(0, 8)}
                  </ProjectLink>
                </td>
                <td className="py-2.5 pr-4 text-xs text-muted-foreground tabular-nums">
                  {startedAt ? (
                    <HoverSwap primary={formatDateTime(startedAt)} secondary={formatRelative(startedAt)} />
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2.5 pr-4 text-xs text-muted-foreground tabular-nums">
                  {startedAt && endedAt ? formatDuration(endedAt.getTime() - startedAt.getTime()) : '—'}
                </td>
                <td className="py-2.5 pr-4 text-xs text-muted-foreground tabular-nums">
                  {s.eventCount.toLocaleString()}
                </td>
                <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                  <PlatformLabel
                    browser={s.browser}
                    os={s.os}
                    device={s.device}
                    platform={s.platform}
                    bot={s.bot}
                    iconSize={14}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {error && (
        <div className="mt-4 mb-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{error.message}</span>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => fetchSessions(error.pageToken)}>
            Retry
          </Button>
        </div>
      )}

      {!error && nextToken && (
        <div className="my-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fetchSessions(nextToken)}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Load more sessions'}
          </Button>
        </div>
      )}
    </>
  )
}

export default ProfileSessions
