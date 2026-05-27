import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { useParams } from 'wouter'
import type { ActivityEvent, HeatmapDay } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import LoadingSpinner from '@/components/loading-spinner'
import ProjectLink from '@/components/project-link'
import { Badge } from '@/components/ui/badge'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { formatRelative } from '@/hooks/use-relative-time'
import { getSeriesColor } from '@/lib/event-colors'
import { structToEntries } from '@/lib/struct'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { profileFamilyAtom, profileStatsFamilyAtom } from './_data'
import ProfileShell from './_shell'

const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-2">
    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
    <div className="flex-1 h-px bg-border" />
    {right && <span className="text-[10px] text-muted-foreground">{right}</span>}
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
            className="h-8 w-2 rounded-sm bg-primary"
            style={{ opacity }}
            title={`${d.date} · ${d.count} events`}
          />
        )
      })}
    </div>
  )
}

const ProfileOverview = () => {
  const { profileId } = useParams<{ profileId: string }>()
  if (!profileId) return null
  return (
    <ProfileShell profileId={profileId}>
      <OverviewBody profileId={profileId} />
    </ProfileShell>
  )
}

const OverviewBody = ({ profileId }: { profileId: string }) => {
  const profile = useAtomValue(profileFamilyAtom(profileId))
  const stats = useAtomValue(profileStatsFamilyAtom(profileId))
  const activityRPC = useAtomValue(activityRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [recent, setRecent] = useState<ActivityEvent[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)

  useEffect(() => {
    if (!headers) return
    let cancelled = false
    setLoadingRecent(true)
    activityRPC
      .getActivityFeed({ distinctId: profileId, pageSize: 10, pageToken: '' }, { headers })
      .then(resp => {
        if (!cancelled) setRecent(resp.events.slice(0, 10))
      })
      .catch(err => console.error('getActivityFeed (overview) failed:', err))
      .finally(() => {
        if (!cancelled) setLoadingRecent(false)
      })
    return () => {
      cancelled = true
    }
  }, [profileId, headers, activityRPC])

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
          <SectionHeader title="Identified properties" right={`${propEntries.length} traits`} />
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
          {propEntries.length > 5 && (
            <ProjectLink
              href={`/profiles/${profileId}/properties`}
              className="mt-3 inline-block text-xs text-primary hover:underline underline-offset-4"
            >
              See all {propEntries.length} →
            </ProjectLink>
          )}
        </section>
      )}

      <section>
        <SectionHeader title="Recent activity" right="last 10 events" />
        {loadingRecent ? (
          <LoadingSpinner />
        ) : recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">No events yet for this profile.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {recent.map(e => {
              const d = tsToDate(e.occurTime)
              const colors = getSeriesColor(e.kind)
              return (
                <li key={e.eventId} className="flex items-center gap-3 py-2 text-xs">
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-medium px-2 py-0.5 shrink-0"
                    style={{ backgroundColor: colors.fill, color: colors.dot }}
                  >
                    {e.kind}
                  </Badge>
                  <span className="text-muted-foreground tabular-nums">
                    {d && <HoverSwap primary={formatRelative(d)} secondary={formatDateTime(d)} />}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <ProjectLink
          href={`/profiles/${profileId}/events`}
          className="mt-3 inline-block text-xs text-primary hover:underline underline-offset-4"
        >
          See all events →
        </ProjectLink>
      </section>
    </div>
  )
}

export default ProfileOverview
