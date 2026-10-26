import { useAtomValue, useSetAtom } from 'jotai'
import { Bot, Copy, UserX } from 'lucide-react'
import { lazy, type ReactNode, Suspense } from 'react'
import { Redirect, useLocation } from 'wouter'
import { LocationLabel } from '@/components/country-flag'
import HoverSwap from '@/components/hover-swap'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import { PlatformLabel } from '@/components/platform-label'
import ProjectLink from '@/components/project-link'
import { Button } from '@/components/ui/button'
import { projectsLoadedAtom } from '@/data/workspace.atoms'
import { formatRelative, useRelativeTime } from '@/hooks/use-relative-time'
import { isCookielessId } from '@/lib/cookieless'
import { useProjectPrefix } from '@/lib/project-path'
import { useRouteParams } from '@/lib/route-params'
import { formatDateTime, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { type ProfileIdentity, resolveIdentity } from '../_identity'
import StatusDot from '../_status-dot'
import { profileFamilyAtom, visitorFamilyAtom } from './_data'

// The router imports this shell eagerly, so a static avatar import puts DiceBear on every route's first load.
const ProfileAvatar = lazy(() => import('../_avatar').then(module => ({ default: module.ProfileAvatar })))

type Tab = { suffix: string; label: string }

const TABS = [
  { suffix: '', label: 'Overview' },
  { suffix: '/events', label: 'Events' },
  { suffix: '/sessions', label: 'Sessions' },
  { suffix: '/properties', label: 'Properties' },
]

// Overview and Properties read the profile, which a visitor doesn't have.
const VISITOR_TABS = [
  { suffix: '/events', label: 'Events' },
  { suffix: '/sessions', label: 'Sessions' },
]

// The URL after `base`: '' for overview, '/events' / '/sessions/:sessionId' for sub-tabs.
const tailOf = (location: string, base: string) => {
  const baseIdx = location.indexOf(base)
  return baseIdx >= 0 ? location.slice(baseIdx + base.length) : ''
}

// Drilling into '/sessions/:sessionId' should still keep the Sessions tab active.
const isOnTab = (tail: string, suffix: string) =>
  suffix === '' ? tail === '' : tail === suffix || tail.startsWith(`${suffix}/`)

const ShellTabs = ({ tabs, base }: { tabs: Tab[]; base: string }) => {
  const [location] = useLocation()
  const tail = tailOf(location, base)
  const activeTab = tabs.find(t => isOnTab(tail, t.suffix)) ?? tabs[0]

  return (
    <div className="-mt-2 mb-6 border-b border-border">
      <nav className="-mb-px flex gap-6">
        {tabs.map(tab => {
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
  )
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
    <p className="text-2xl tabular-nums">{value.toLocaleString()}</p>
    <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
  </div>
)

const Meta = ({ label, children }: { label?: string; children: ReactNode }) => (
  <span className="flex items-center gap-1.5">
    {label && <span className="text-faint">{label}</span>}
    {children}
  </span>
)

const IdChip = ({ label, value, children }: { label?: string; value: string; children?: ReactNode }) => (
  <span className="group flex min-w-0 items-center gap-1.5">
    {label && <span className="shrink-0 text-faint">{label}</span>}
    <span className="min-w-0 truncate font-mono" title={value}>
      {children ?? value}
    </span>
    <CopyButton value={value} />
  </span>
)

const HeaderAvatar = ({
  identity,
  bot,
  children,
}: {
  identity: ProfileIdentity
  bot?: boolean
  children?: ReactNode
}) => (
  <div className="relative shrink-0">
    <Suspense fallback={<div className="size-10 rounded-md bg-muted" />}>
      <ProfileAvatar identity={identity} bot={bot} className="size-10 rounded-md" />
    </Suspense>
    {children && <span className="absolute -bottom-0.5 -right-0.5">{children}</span>}
  </div>
)

type Activity = {
  bot?: boolean
  firstSeen: Date | null
  lastSeen: Date | null
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  city?: string
  region?: string
  country?: string
}

const ActivityMeta = ({ activity, created }: { activity: Activity; created?: Date | null }) => {
  const lastSeenLive = useRelativeTime(activity.lastSeen)

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
      {activity.bot && (
        <Meta>
          <Bot className="size-3.5" aria-hidden />
          Automated traffic
        </Meta>
      )}
      {created && (
        <Meta label="Created">
          <HoverSwap primary={formatDateTime(created)} secondary={formatRelative(created)} />
        </Meta>
      )}
      {activity.firstSeen && (
        <Meta label="First seen">
          <HoverSwap primary={formatRelative(activity.firstSeen)} secondary={formatDateTime(activity.firstSeen)} />
        </Meta>
      )}
      {activity.lastSeen && (
        <Meta label="Last seen">
          <HoverSwap primary={lastSeenLive} secondary={formatDateTime(activity.lastSeen)} />
        </Meta>
      )}
      {(activity.browser || activity.os) && (
        <Meta>
          <PlatformLabel
            browser={activity.browser}
            browserVersion={activity.browserVersion}
            os={activity.os}
            osVersion={activity.osVersion}
            bot={activity.bot}
          />
        </Meta>
      )}
      {(activity.city || activity.country) && (
        <Meta>
          <LocationLabel city={activity.city} region={activity.region} country={activity.country} />
        </Meta>
      )}
    </div>
  )
}

const EmptyShell = ({ title, id, message }: { title: string; id: string; message: string }) => (
  <Page title={title} description={id}>
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
      <UserX className="w-8 h-8 mb-3 opacity-20" />
      <p className="text-sm">{message}</p>
      <p className="mt-1 font-mono text-xs">{id}</p>
    </div>
  </Page>
)

const PersonShell = ({ profileId, base, children }: { profileId: string; base: string; children: ReactNode }) => {
  const profile = useAtomValue(profileFamilyAtom(profileId))
  if (!profile) return <EmptyShell title="Profile" id={profileId} message="No profile found" />

  const identity = resolveIdentity(profile)
  const firstSeen = tsToDate(profile.activity?.firstSeen)
  const lastSeen = tsToDate(profile.activity?.lastSeen)

  const header = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 grow basis-[15rem] items-start gap-3">
          <HeaderAvatar identity={identity} bot={profile.activity?.bot}>
            <StatusDot lastSeen={lastSeen} />
          </HeaderAvatar>
          <div className="min-w-0 space-y-1">
            <span className={cn('block truncate text-xl', identity.isFallback && 'font-mono')}>{identity.name}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {profile.externalId && profile.externalId !== identity.name && (
                <IdChip label="ext" value={profile.externalId} />
              )}
              {profile.id && profile.id !== identity.name && (
                <IdChip label="distinct" value={profile.id}>
                  {profile.id.slice(0, 12)}…
                </IdChip>
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
      <ActivityMeta activity={{ ...profile.activity, firstSeen, lastSeen }} created={tsToDate(profile.createTime)} />
    </div>
  )

  return (
    <Page header={header} title={identity.name}>
      <ShellTabs tabs={TABS} base={base} />
      {children}
    </Page>
  )
}

const VISITOR_NAME = 'Cookieless visitor'

const VisitorShell = ({ visitorId, base, children }: { visitorId: string; base: string; children: ReactNode }) => {
  const { visitor, failed } = useAtomValue(visitorFamilyAtom(visitorId))
  const refresh = useSetAtom(visitorFamilyAtom(visitorId))

  if (!visitor && !failed)
    return <EmptyShell title={VISITOR_NAME} id={visitorId} message="No events for this visitor" />

  const identity = { name: VISITOR_NAME, isFallback: false, avatarSeed: visitorId, avatarUrl: visitor?.avatarUrl }

  const header = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 grow basis-[15rem] items-start gap-3">
          <HeaderAvatar identity={identity} bot={visitor?.bot}>
            {visitor && <StatusDot lastSeen={visitor.lastSeen} />}
          </HeaderAvatar>
          <div className="min-w-0 space-y-1">
            <span className="block truncate text-xl">{VISITOR_NAME}</span>
            <div className="flex text-xs text-muted-foreground">
              <IdChip value={visitorId} />
            </div>
          </div>
        </div>
        {visitor && (
          <div className="flex shrink-0 gap-8 text-right">
            <Stat label="events" value={Number(visitor.totalEvents)} />
            <Stat label="sessions" value={visitor.sessions} />
          </div>
        )}
      </div>
      {failed && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Couldn't load this visitor's summary.
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => refresh()}>
            Retry
          </Button>
        </div>
      )}
      {visitor && <ActivityMeta activity={visitor} />}
      <p className="text-xs text-muted-foreground">
        One browser on one network, for one UTC day. May be more than one person.
      </p>
    </div>
  )

  return (
    <Page header={header} title={VISITOR_NAME}>
      <ShellTabs tabs={VISITOR_TABS} base={base} />
      {children}
    </Page>
  )
}

// Events and Sessions read by the route id alone, so a cookieless visitor shares the profile route.
const ProfileShell = ({ children }: { children: ReactNode }) => {
  const { profileId = '' } = useRouteParams<{ profileId: string }>()
  const [location] = useLocation()
  const prefix = useProjectPrefix()
  // ProjectSync renders before the project list lands, when every read would come back empty.
  const projectsLoaded = useAtomValue(projectsLoadedAtom)
  const base = `/profiles/${encodeURIComponent(profileId)}`

  if (!projectsLoaded) return <LoadingSpinner />
  if (!isCookielessId(profileId)) {
    return (
      <PersonShell profileId={profileId} base={base}>
        {children}
      </PersonShell>
    )
  }

  // Before VisitorShell, so a redirect never waits on the visitor read.
  const tail = tailOf(location, base)
  if (!VISITOR_TABS.some(t => isOnTab(tail, t.suffix))) return <Redirect to={`${prefix}${base}/events`} replace />
  return (
    <VisitorShell visitorId={profileId} base={base}>
      {children}
    </VisitorShell>
  )
}

export default ProfileShell
