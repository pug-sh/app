import type { ReactNode } from 'react'
import { Link } from 'wouter'

import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { CountryFlag } from '@/components/country-flag'
import { DomainFavicon } from '@/components/domain-favicon'
import IdentityAvatar from '@/components/identity-avatar'
import {
  activeSpan,
  describeEvent,
  formatCountryName,
  localClock,
  sessionStats,
} from '@/components/live-map/live-visitors'
import type { ClusterMapMarker, VisitorMapMarker } from '@/components/live-map/markers'
import { BrowserLabel, DeviceLabel, OsLabel } from '@/components/platform-label'
import { formatRelative } from '@/hooks/use-relative-time'
import { formatDeviceLabel, formatOsLabel } from '@/lib/devicon-map'
import { getSeriesColor } from '@/lib/event-colors'
import { formatLocality } from '@/lib/location'
import { formatClock, tsToDate } from '@/lib/timestamp'

const JOURNEY_ROWS = 3
const KIND_ROWS = 4

const Dot = () => <span className="text-muted-foreground/30">·</span>

const Row = ({ kind, detail, trailing }: { kind: string; detail?: string; trailing?: string }) => (
  <li className="flex items-center justify-between gap-2">
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: getSeriesColor(kind).dot }} />
      <span className="shrink-0 text-foreground">{kind}</span>
      {detail && <span className="truncate text-muted-foreground">{detail}</span>}
    </span>
    {trailing && <span className="shrink-0 tabular-nums text-faint">{trailing}</span>}
  </li>
)

const Section = ({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) => (
  <div className="border-t border-border/40 px-3 py-2.5">
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
      <div className="h-px flex-1 bg-border/60" />
      {meta && <span className="shrink-0 text-xs tabular-nums text-faint">{meta}</span>}
    </div>
    {children}
  </div>
)

// Opaque so the arrow meets the body seamlessly; `relative` is load-bearing — it lifts the body over
// the arrow's inner half, which is otherwise painted on top. Radius is coupled to ARROW_INSET.
export const POPOVER_SURFACE =
  'relative w-[19rem] rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-border/40'

// Next to an OS the device drops its icon, and drops out entirely when the OS already named it.
const DeviceCell = ({ device, os, osVersion }: { device: string; os?: string; osVersion?: string }) => {
  if (!os) return <DeviceLabel device={device} iconSize={14} fallback="" />
  const label = formatDeviceLabel(device, os).trim()
  if (!label || formatOsLabel(os, osVersion).toLowerCase().includes(label.toLowerCase())) return null
  return <span className="truncate">{label}</span>
}

type VisitorProps = {
  marker: VisitorMapMarker
  journey: ActivityEvent[]
  profileHref?: (distinctId: string) => string
  // The pinned visitor aged out of the live window — their marker is gone, so the popover holds the
  // last thing they did rather than vanishing mid-read.
  left?: boolean
}

export const VisitorPopover = ({ marker, journey, profileHref, left }: VisitorProps) => {
  const country = formatCountryName(marker.iso)
  const place = formatLocality(marker.city, marker.region)
  const clock = localClock(marker.timezone, marker.lastSeen)
  // Same rule the panel row uses, so the two can't disagree about one visitor on one screen.
  const span = activeSpan(sessionStats(journey).get(marker.distinctId))
  // The headline already is the newest event; the session list is the trail behind it.
  const trail = journey.slice(1, 1 + JOURNEY_ROWS)
  const href = profileHref?.(marker.distinctId)
  const source = marker.referrer ?? marker.utmSource
  // For a page view the headline detail already is the path; repeating it is noise.
  const showPage = marker.page !== '—' && marker.page !== marker.detail

  return (
    <div className="text-xs">
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2.5">
        <IdentityAvatar
          id={marker.distinctId}
          src={marker.avatarUrl}
          className={`size-9 rounded-full ring-1 ring-border/40 ${left ? 'grayscale opacity-70' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: getSeriesColor(marker.kind).dot }}
            />
            {/* Kind and detail get a line each — sharing one truncated both to half a box. */}
            <span className="truncate text-sm font-medium text-foreground">{marker.kind}</span>
          </div>
          {marker.detail && <div className="truncate text-muted-foreground">{marker.detail}</div>}
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-faint">
            {/* A resolved name is a person, so it steps up an ink tier and out of the mono face an
                opaque id needs. */}
            <span
              className={`truncate ${marker.identity.isFallback ? 'font-mono' : 'text-muted-foreground'}`}
              title={marker.distinctId}
            >
              {marker.identity.label}
            </span>
            {marker.lastSeen && (
              <>
                <Dot />
                <span className="shrink-0 tabular-nums">
                  {left && 'left '}
                  {formatRelative(marker.lastSeen)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1 border-t border-border/40 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <CountryFlag code={marker.iso} size={14} />
          <span className="truncate text-foreground">{place || country}</span>
          {place && country && (
            <>
              <Dot />
              <span className="shrink-0 truncate text-muted-foreground">{country}</span>
            </>
          )}
        </div>
        {(showPage || clock) && (
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {showPage && <span className="truncate">{marker.page}</span>}
            {showPage && clock && <Dot />}
            {clock && <span className="shrink-0 tabular-nums text-faint">{clock} local</span>}
          </div>
        )}
        {source && (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">from</span>
            {marker.referrer && <DomainFavicon domain={marker.referrer} />}
            <span className="truncate text-foreground">{source}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 px-3 py-2.5 text-foreground">
        <BrowserLabel browser={marker.browser} browserVersion={marker.browserVersion} iconSize={14} fallback="" />
        <OsLabel os={marker.os} osVersion={marker.osVersion} iconSize={14} fallback="" />
        <DeviceCell device={marker.device} os={marker.os} osVersion={marker.osVersion} />
      </div>

      {trail.length > 0 && (
        <Section title="Session" meta={[span, `${journey.length} events`].filter(Boolean).join(' · ')}>
          <ol className="space-y-1">
            {trail.map((event, i) => {
              const { kind, detail } = describeEvent(event)
              const at = tsToDate(event.occurTime)
              return (
                <Row
                  key={`${event.eventId || kind}-${i}`}
                  kind={kind}
                  detail={detail}
                  trailing={at ? formatClock(at) : undefined}
                />
              )
            })}
          </ol>
        </Section>
      )}

      {href && (
        <Link
          href={href}
          className="flex items-center justify-center gap-1 rounded-b-xl border-t border-border/40 px-3 py-2 font-medium text-link underline-offset-4 hover:bg-accent/60 hover:underline"
        >
          View profile →
        </Link>
      )}
    </div>
  )
}

export const ClusterPopover = ({ cluster }: { cluster: ClusterMapMarker }) => {
  const country = formatCountryName(cluster.iso)
  const place = formatLocality(cluster.city, cluster.region)
  const rest = cluster.kinds.length - KIND_ROWS

  return (
    <div className="text-xs">
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <CountryFlag code={cluster.iso} size={14} />
            <span className="truncate text-sm font-medium text-foreground">{place || country}</span>
          </div>
          {place && <div className="truncate text-muted-foreground">{country}</div>}
        </div>
        <span className="shrink-0 text-sm tabular-nums text-foreground">{cluster.count}</span>
      </div>

      <Section title="Doing now" meta={rest > 0 ? `+${rest} more` : undefined}>
        <ol className="space-y-1">
          {cluster.kinds.slice(0, KIND_ROWS).map(kind => (
            <Row key={kind.name} kind={kind.name} trailing={String(kind.count)} />
          ))}
        </ol>
      </Section>

      <div className="border-t border-border/40 px-3 py-2 text-center text-faint">Click to zoom in</div>
    </div>
  )
}
