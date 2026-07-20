import { useAtomValue } from 'jotai'
import { AlertCircle, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ActivityEvent, HeatmapDay } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import { InlineEventProps } from '@/components/inline-event-props'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import ProjectLink from '@/components/project-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { formatRelative } from '@/hooks/use-relative-time'
import { getSeriesColor } from '@/lib/event-colors'
import { useRouteParams } from '@/lib/route-params'
import { toastRPCError } from '@/lib/rpc-error'
import { structToEntries } from '@/lib/struct'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { resolveInlineProps } from '@/lib/well-known-events'
import { profileFamilyAtom, profileStatsFamilyAtom } from './_data'

const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-2">
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
    <div className="flex-1 h-px bg-border" />
    {right && <span className="text-xs text-muted-foreground">{right}</span>}
  </div>
)

const Heatmap = ({ days }: { days: HeatmapDay[] }) => {
  if (days.length === 0) return <p className="text-xs text-muted-foreground">No activity in the last 60 days.</p>
  const max = days.reduce((m, d) => (d.count > m ? d.count : m), 0n)
  const maxNum = Number(max) || 1
  return (
    <div className="flex gap-[2px]">
      {days.map(d => {
        const v = Number(d.count) / maxNum
        const opacity = d.count === 0n ? 0.06 : 0.2 + v * 0.8
        return (
          <div
            key={d.date}
            className="h-8 w-2 rounded-sm bg-link"
            style={{ opacity }}
            title={`${d.date} · ${d.count} events`}
          />
        )
      })}
    </div>
  )
}

const ProfileOverview = () => {
  const { profileId } = useRouteParams<{ profileId: string }>()
  const project = useAtomValue(activeProjectAtom)
  if (!project) return <NoProject title="Profile" icon={User} />
  if (!profileId) return null
  return <OverviewBody profileId={profileId} />
}

const OverviewBody = ({ profileId }: { profileId: string }) => {
  const profile = useAtomValue(profileFamilyAtom(profileId))
  const stats = useAtomValue(profileStatsFamilyAtom(profileId))
  const project = useAtomValue(activeProjectAtom)
  const activityRPC = useAtomValue(activityRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [recent, setRecent] = useState<ActivityEvent[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [recentError, setRecentError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!headers) return
    let cancelled = false
    setLoadingRecent(true)
    setRecentError(null)
    activityRPC
      .getActivityFeed({ distinctId: profileId, pageSize: 10, pageToken: '' }, { headers })
      .then(resp => {
        if (!cancelled) setRecent(resp.events.slice(0, 10))
      })
      .catch(err => {
        if (cancelled) return
        toastRPCError(err, 'Failed to load recent activity')
        setRecentError(err instanceof Error ? err.message : 'Failed to load recent activity')
      })
      .finally(() => {
        if (!cancelled) setLoadingRecent(false)
      })
    return () => {
      cancelled = true
    }
  }, [profileId, headers, activityRPC, reloadKey])

  // structToEntries strips object/array/null values; total trait count comes from raw keys
  // so the "See all N" link matches what the Properties tab actually renders.
  const totalProps = Object.keys(profile?.properties ?? {}).length
  const propEntries = profile?.properties ? structToEntries(profile.properties) : []
  const sortedProps = [...propEntries].sort(
    ([a], [b]) => Number(a.startsWith('$')) - Number(b.startsWith('$')) || a.localeCompare(b),
  )
  const topProps = sortedProps.slice(0, 5)

  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title="Activity" right="last 60 days" />
        <Heatmap days={stats?.heatmap ?? []} />
      </section>

      {topProps.length > 0 && (
        <section>
          <SectionHeader title="Identified properties" right={`${totalProps} traits`} />
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-xs">
            {topProps.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="font-mono text-muted-foreground">{key}</dt>
                <dd className="truncate" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {totalProps > topProps.length && (
            <ProjectLink
              href={`/profiles/${encodeURIComponent(profileId)}/properties`}
              className="mt-3 inline-block text-xs text-link hover:underline underline-offset-4"
            >
              See all {totalProps} →
            </ProjectLink>
          )}
        </section>
      )}

      <section>
        <SectionHeader title="Recent activity" right="last 10 events" />
        {loadingRecent ? (
          <LoadingSpinner />
        ) : recentError && recent.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{recentError}</span>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setReloadKey(k => k + 1)}>
              Retry
            </Button>
          </div>
        ) : recent.length === 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">No events yet for this profile.</p>
            {project && (
              <p className="text-xs text-muted-foreground/70">
                Project <span className="font-mono">{project.id}</span>
                {project.displayName && <> · {project.displayName}</>}
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {recent.map(e => {
              const d = tsToDate(e.occurTime)
              const colors = getSeriesColor(e.kind)
              const inline = resolveInlineProps(e.kind, e.customProperties, e.autoProperties)
              return (
                <li key={e.eventId} className="flex items-center gap-3 py-2.5 text-xs">
                  <Badge
                    variant="secondary"
                    className="text-xs font-medium px-2 py-0.5 shrink-0"
                    style={{ backgroundColor: colors.fill, color: colors.dot }}
                  >
                    {e.kind}
                  </Badge>
                  {d && (
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap shrink-0">
                      <HoverSwap primary={formatRelative(d)} secondary={formatDateTime(d)} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <InlineEventProps {...inline} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <ProjectLink
          href={`/profiles/${encodeURIComponent(profileId)}/events`}
          className="mt-3 inline-block text-xs text-link hover:underline underline-offset-4"
        >
          See all events →
        </ProjectLink>
      </section>
    </div>
  )
}

export default ProfileOverview
