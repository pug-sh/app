import { useAtomValue } from 'jotai'
import { Copy, UserX } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation, useParams } from 'wouter'
import { LocationLabel } from '@/components/country-flag'
import HoverSwap from '@/components/hover-swap'
import Page from '@/components/layout/page'
import { PlatformLabel } from '@/components/platform-label'
import ProjectLink from '@/components/project-link'
import { formatRelative, useRelativeTime } from '@/hooks/use-relative-time'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { ProfileAvatar } from '../_avatar'
import { resolveIdentity } from '../_identity'
import { profileFamilyAtom } from './_data'

const TABS = [
  { suffix: '', label: 'Overview' },
  { suffix: '/events', label: 'Events' },
  { suffix: '/sessions', label: 'Sessions' },
  { suffix: '/properties', label: 'Properties' },
] as const

const StatusDot = ({ lastSeen }: { lastSeen: Date | null }) => {
  if (!lastSeen) {
    return <span className="inline-block size-2.5 rounded-full bg-muted-foreground/30 ring-2 ring-background" />
  }
  const minsAgo = (Date.now() - lastSeen.getTime()) / 60_000
  const color = minsAgo < 5 ? 'bg-emerald-500' : minsAgo < 60 * 24 ? 'bg-amber-500' : 'bg-muted-foreground/30'
  return <span className={cn('inline-block size-2.5 rounded-full ring-2 ring-background', color)} />
}

const CopyButton = ({ value }: { value: string }) => (
  <button
    type="button"
    onClick={() => navigator.clipboard.writeText(value)}
    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 text-muted-foreground hover:text-foreground"
    aria-label="Copy"
  >
    <Copy className="w-3 h-3" />
  </button>
)

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div>
    <p className="text-2xl font-medium tabular-nums">{value.toLocaleString()}</p>
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
  </div>
)

const Meta = ({ label, children }: { label?: string; children: ReactNode }) => (
  <span className="flex items-center gap-1.5">
    {label && <span className="text-muted-foreground/60">{label}</span>}
    {children}
  </span>
)

const ProfileShell = ({ children }: { children: ReactNode }) => {
  const { profileId = '' } = useParams<{ profileId: string }>()
  const profile = useAtomValue(profileFamilyAtom(profileId))
  const [location] = useLocation()

  const lastSeen = tsToDate(profile?.activity?.lastSeen)
  const lastSeenLive = useRelativeTime(lastSeen)

  if (!profile) {
    return (
      <Page title="Profile" description={profileId}>
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <UserX className="w-8 h-8 mb-3 opacity-20" />
          <p className="text-sm">No profile found</p>
          <p className="mt-1 font-mono text-xs">{profileId}</p>
        </div>
      </Page>
    )
  }

  const identity = resolveIdentity(profile)
  const firstSeen = tsToDate(profile.activity?.firstSeen)
  const createTime = tsToDate(profile.createTime)

  const base = `/profiles/${encodeURIComponent(profileId)}`
  // Tail = URL segment after `base`. '' for overview, '/events' / '/sessions/[id]' for sub-tabs.
  // Drilling into '/sessions/:sessionId' should still keep the Sessions tab active.
  const baseIdx = location.indexOf(base)
  const tail = baseIdx >= 0 ? location.slice(baseIdx + base.length) : ''
  const activeTab =
    TABS.find(t => (t.suffix === '' ? tail === '' : tail === t.suffix || tail.startsWith(t.suffix + '/'))) ?? TABS[0]

  const header = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 grow basis-[15rem] items-start gap-3">
          <div className="relative shrink-0">
            <ProfileAvatar identity={identity} className="size-10 rounded-md text-sm" />
            <span className="absolute -bottom-0.5 -right-0.5">
              <StatusDot lastSeen={lastSeen} />
            </span>
          </div>
          <div className="min-w-0 space-y-1">
            <span className={cn('block truncate text-xl font-medium', identity.isFallback && 'font-mono')}>
              {identity.name}
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {profile.externalId && profile.externalId !== identity.name && (
                <span className="group flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-muted-foreground/60">ext</span>
                  <span className="min-w-0 truncate font-mono" title={profile.externalId}>
                    {profile.externalId}
                  </span>
                  <CopyButton value={profile.externalId} />
                </span>
              )}
              {profile.id && profile.id !== identity.name && (
                <span className="group flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-muted-foreground/60">distinct</span>
                  <span className="min-w-0 truncate font-mono" title={profile.id}>
                    {profile.id.slice(0, 12)}…
                  </span>
                  <CopyButton value={profile.id} />
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-8 text-right">
          <Stat label="events" value={Number(profile.activity?.totalEvents ?? 0n)} />
          <Stat label="sessions" value={Number(profile.activity?.sessions ?? 0n)} />
          <Stat label="pageviews" value={Number(profile.activity?.pageviews ?? 0n)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {createTime && (
          <Meta label="Created">
            <HoverSwap primary={formatDateTime(createTime)} secondary={formatRelative(createTime)} />
          </Meta>
        )}
        {firstSeen && (
          <Meta label="First seen">
            <HoverSwap primary={formatRelative(firstSeen)} secondary={formatDateTime(firstSeen)} />
          </Meta>
        )}
        {lastSeen && (
          <Meta label="Last seen">
            <HoverSwap primary={lastSeenLive} secondary={formatDateTime(lastSeen)} />
          </Meta>
        )}
        {(profile.activity?.browser || profile.activity?.os) && (
          <Meta>
            <PlatformLabel
              browser={profile.activity?.browser}
              browserVersion={profile.activity?.browserVersion}
              os={profile.activity?.os}
              osVersion={profile.activity?.osVersion}
            />
          </Meta>
        )}
        {(profile.activity?.city || profile.activity?.country) && (
          <Meta>
            <LocationLabel
              city={profile.activity?.city}
              region={profile.activity?.region}
              country={profile.activity?.country}
            />
          </Meta>
        )}
      </div>
    </div>
  )

  return (
    <Page header={header} title={identity.name}>
      <div className="-mt-2 mb-6 border-b border-border">
        <nav className="-mb-px flex gap-6">
          {TABS.map(tab => {
            const isActive = tab.suffix === activeTab.suffix
            return (
              <ProjectLink
                key={tab.label}
                href={base + tab.suffix}
                className={cn(
                  'border-b-2 pb-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-foreground/50 text-foreground/70'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </ProjectLink>
            )
          })}
        </nav>
      </div>
      {children}
    </Page>
  )
}

export default ProfileShell
