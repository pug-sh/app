import { Laptop, Monitor, Smartphone } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { CountryFlag } from '@/components/country-flag'
import IdentityAvatar from '@/components/identity-avatar'
import {
  activeSpan,
  describeEvent,
  eventAvatarUrl,
  eventIdentity,
  formatCountryName,
  isMobileVisitor,
  localClock,
  type SessionStat,
} from '@/components/live-map/live-visitors'
import { getSeriesColor } from '@/lib/event-colors'
import { formatLocality } from '@/lib/location'
import { structGet } from '@/lib/struct'
import { formatClock, tsToDate } from '@/lib/timestamp'

const EventLine = ({ kind, detail }: { kind: string; detail: string }) => {
  const color = getSeriesColor(kind).dot
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="shrink-0 font-medium">{kind}</span>
      {detail && <span className="truncate text-muted-foreground">{detail}</span>}
    </span>
  )
}

// A pin outranks the map's pointer, which outranks this list's own hover.
const rowTone = (selected: boolean, highlighted: boolean) => {
  if (selected) return 'bg-primary/10 ring-1 ring-primary/30'
  if (highlighted) return 'bg-accent/70'
  return 'hover:bg-muted/50'
}

const Journey = ({ events }: { events: ActivityEvent[] }) => (
  <ol className="mt-1 space-y-1 border-l border-border/40 pl-3">
    {events.slice(0, 8).map((event, i) => {
      const { kind, detail } = describeEvent(event)
      const at = tsToDate(event.occurTime)
      return (
        <li key={`${event.eventId || kind}-${i}`} className="flex items-center justify-between gap-2 text-xs">
          <EventLine kind={kind} detail={detail} />
          {at && <span className="shrink-0 tabular-nums text-xs text-faint">{formatClock(at)}</span>}
        </li>
      )
    })}
  </ol>
)

type Props = {
  visitor: ActivityEvent
  journey: ActivityEvent[]
  stat?: SessionStat
  selected: boolean
  highlighted: boolean
  onClick: () => void
  onHover: (distinctId: string | null) => void
}

const VisitorRow = ({ visitor, journey, stat, selected, highlighted, onClick, onHover }: Props) => {
  const ref = useRef<HTMLLIElement>(null)
  const lastSeen = tsToDate(visitor.occurTime)
  const auto = visitor.autoProperties
  const { kind, detail } = describeEvent(visitor)
  const country = structGet(auto, '$country')
  const device = structGet(auto, '$device')
  const mobile = isMobileVisitor(auto)
  const DeviceIcon = mobile ? Smartphone : device ? Laptop : Monitor
  const locality = formatLocality(structGet(auto, '$city'), structGet(auto, '$region'))
  const countryName = country ? formatCountryName(country) : null
  const localTime = localClock(structGet(auto, '$timezone'), lastSeen)
  const identity = eventIdentity(visitor)
  // Time active, not last-seen: a live list's "last seen" reads "just now" all the way down.
  const span = activeSpan(stat)

  // Bring the hovered marker's row into view; `nearest` keeps a visible row exactly where it is.
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => onHover(visitor.distinctId)}
        onMouseLeave={() => onHover(null)}
        className={`group flex w-full gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${rowTone(selected, highlighted)}`}
      >
        <IdentityAvatar
          id={visitor.distinctId}
          src={eventAvatarUrl(visitor)}
          className="size-8 self-start rounded-full ring-1 ring-border/40"
        />
        <div className="min-w-0 flex-1">
          {/* The person leads: event kinds repeat down the list, so they don't tell rows apart. */}
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className={`truncate ${identity.isFallback ? 'font-mono text-muted-foreground' : 'text-foreground'}`}>
              {identity.label}
            </span>
            {span && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{span}</span>}
          </div>
          <div className="text-sm">
            <EventLine kind={kind} detail={detail} />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-faint">
            <span className="flex min-w-0 items-center gap-1.5">
              <CountryFlag code={country} size={12} />
              {/* Two ink tiers rather than one faded with alpha, which composites per theme. */}
              <span className="truncate">
                <span className="text-muted-foreground">{locality || countryName || '—'}</span>
                {locality && countryName && ` · ${countryName}`}
              </span>
              <span className="flex shrink-0 items-center gap-1" title={device || (mobile ? 'Mobile' : 'Desktop')}>
                <span className="text-muted-foreground/30">·</span>
                <DeviceIcon className="size-3 shrink-0" />
              </span>
            </span>
            {localTime && <span className="shrink-0 tabular-nums">{localTime}</span>}
          </div>

          {selected && journey.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-faint uppercase tracking-wider">Recent activity</div>
              <Journey events={journey} />
            </div>
          )}
        </div>
      </button>
    </li>
  )
}

export default VisitorRow
