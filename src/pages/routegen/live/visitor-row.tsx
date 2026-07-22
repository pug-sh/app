import { Laptop, Monitor, Smartphone } from 'lucide-react'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import HoverSwap from '@/components/hover-swap'
import IdentityAvatar from '@/components/identity-avatar'
import {
  describeEvent,
  eventAvatarUrl,
  formatCountryName,
  isMobileVisitor,
  visitorLocalTime,
} from '@/components/live-map/live-visitors'
import { formatRelative } from '@/hooks/use-relative-time'
import { getSeriesColor } from '@/lib/event-colors'
import { structGet } from '@/lib/struct'
import { formatClock, formatDateTime, tsToDate } from '@/lib/timestamp'

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
  selected: boolean
  onClick: () => void
}

const VisitorRow = ({ visitor, journey, selected, onClick }: Props) => {
  const lastSeen = tsToDate(visitor.occurTime)
  const auto = visitor.autoProperties
  const { kind, detail } = describeEvent(visitor)
  const country = structGet(auto, '$country')
  const city = structGet(auto, '$city')
  const region = structGet(auto, '$region')
  const browser = structGet(auto, '$browser')
  const device = structGet(auto, '$device')
  const mobile = isMobileVisitor(auto)
  const DeviceIcon = mobile ? Smartphone : device ? Laptop : Monitor
  const locality = [city, region].filter(Boolean).join(', ')
  const countryName = country ? formatCountryName(country) : null
  const localTime = visitorLocalTime(auto, lastSeen)

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`group flex w-full gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
          selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'
        }`}
      >
        <IdentityAvatar
          id={visitor.distinctId}
          src={eventAvatarUrl(visitor)}
          className="size-9 self-start rounded-full ring-1 ring-border/40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <EventLine kind={kind} detail={detail} />
            {lastSeen && (
              <span className="shrink-0 text-xs text-muted-foreground">
                <HoverSwap primary={formatRelative(lastSeen)} secondary={formatDateTime(lastSeen)} />
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {locality ? (
              <>
                {locality}
                {countryName && <span className="text-faint"> · {countryName}</span>}
              </>
            ) : (
              countryName || '—'
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
            {browser && <span className="truncate">{browser}</span>}
            {browser && <span className="text-muted-foreground/30">·</span>}
            <span className="inline-flex items-center gap-1">
              <DeviceIcon className="size-3 shrink-0" />
              {device || (mobile ? 'Mobile' : 'Desktop')}
            </span>
            {localTime && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="tabular-nums">{localTime} local</span>
              </>
            )}
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
