import { useAtomValue } from 'jotai'
import { Copy, UserX } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation } from 'wouter'
import HoverSwap from '@/components/hover-swap'
import Page from '@/components/layout/page'
import ProjectLink from '@/components/project-link'
import { formatRelative, useRelativeTime } from '@/hooks/use-relative-time'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { profileFamilyAtom } from './_data'

const TABS = [
  { suffix: '', label: 'Overview' },
  { suffix: '/events', label: 'Events' },
  { suffix: '/sessions', label: 'Sessions' },
  { suffix: '/properties', label: 'Properties' },
] as const

const StatusDot = ({ lastSeen }: { lastSeen: Date | null }) => {
  if (!lastSeen) return <span className="inline-block size-2 rounded-full bg-muted-foreground/30" />
  const minsAgo = (Date.now() - lastSeen.getTime()) / 60_000
  const color = minsAgo < 5 ? 'bg-emerald-500' : minsAgo < 60 * 24 ? 'bg-amber-500' : 'bg-muted-foreground/30'
  return <span className={cn('inline-block size-2 rounded-full', color)} />
}

const CopyButton = ({ value }: { value: string }) => (
  <button
    type="button"
    onClick={() => navigator.clipboard.writeText(value)}
    className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
    aria-label="Copy"
  >
    <Copy className="w-3 h-3" />
  </button>
)

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div>
    <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
  </div>
)

const Meta = ({ label, children }: { label?: string; children: ReactNode }) => (
  <span className="flex items-center gap-1.5">
    {label && <span className="text-muted-foreground/60">{label}</span>}
    {children}
  </span>
)

const ProfileShell = ({ profileId, children }: { profileId: string; children: ReactNode }) => {
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

  const firstSeen = tsToDate(profile.activity?.firstSeen)
  const createTime = tsToDate(profile.createTime)
  const browser = [profile.activity?.browser, profile.activity?.browserVersion].filter(Boolean).join(' ')
  const os = [profile.activity?.os, profile.activity?.osVersion].filter(Boolean).join(' ')
  const platform = [browser, os].filter(Boolean).join(' · ')
  const place = [profile.activity?.city, profile.activity?.country].filter(Boolean).join(', ')

  const base = `/profiles/${encodeURIComponent(profileId)}`
  // Tail = URL segment after `base`. '' for overview, '/events' / '/sessions/[id]' for sub-tabs.
  // Drilling into '/sessions/:sessionId' should still keep the Sessions tab active.
  const baseIdx = location.indexOf(base)
  const tail = baseIdx >= 0 ? location.slice(baseIdx + base.length) : ''
  const activeTab =
    TABS.find(t => (t.suffix === '' ? tail === '' : tail === t.suffix || tail.startsWith(t.suffix + '/'))) ?? TABS[0]

  const header = (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <StatusDot lastSeen={lastSeen} />
            <span className="font-mono text-xl font-semibold">{profileId}</span>
          </div>
          {profile.externalId && (
            <div className="group flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-muted-foreground/60">ext</span>
              <span className="font-mono">{profile.externalId}</span>
              <CopyButton value={profile.externalId} />
            </div>
          )}
          {profile.id && profile.id !== profileId && (
            <div className="group flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-muted-foreground/60">id</span>
              <span className="font-mono">{profile.id.slice(0, 12)}…</span>
              <CopyButton value={profile.id} />
            </div>
          )}
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
        {platform && <Meta>{platform}</Meta>}
        {place && <Meta>{place}</Meta>}
      </div>
    </div>
  )

  return (
    <Page header={header} title={profileId}>
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
                    ? 'border-foreground text-foreground'
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
