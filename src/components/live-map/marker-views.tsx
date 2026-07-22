import { Facehash } from 'facehash'
import { navigate } from 'wouter/use-browser-location'

import { CountryFlag } from '@/components/country-flag'
import { formatCountryName } from '@/components/live-map/live-visitors'
import { type ClusterMapMarker, LIVE_AVATAR_COLORS, type VisitorMapMarker } from '@/components/live-map/markers'
import { BrowserLabel, DeviceLabel } from '@/components/platform-label'
import { getSeriesColor } from '@/lib/event-colors'

const MarkerPopover = ({
  marker,
  selected,
  profileHref,
}: {
  marker: VisitorMapMarker
  selected: boolean
  profileHref?: (distinctId: string) => string
}) => {
  const country = formatCountryName(marker.iso)
  const location = [marker.city, marker.region, country].filter(Boolean).join(', ')
  const color = getSeriesColor(marker.kind).dot
  // Hover popovers are pointer-events-none peeks; only the selected one is clickable, so the
  // profile link is offered there — where it can actually be followed.
  const href = selected ? profileHref?.(marker.distinctId) : undefined

  return (
    <div className="w-56 text-xs">
      <div className="mb-2">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate font-medium text-foreground">{marker.kind}</span>
        </div>
        {marker.page && marker.page !== '—' && <div className="truncate text-muted-foreground">{marker.page}</div>}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <CountryFlag code={marker.iso} size={14} />
          <span className="truncate">{location || country}</span>
        </div>
      </div>
      <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-muted-foreground">
        {marker.browser && (
          <>
            <span>Browser</span>
            <span className="flex min-w-0 justify-end">
              <BrowserLabel browser={marker.browser} iconSize={14} className="text-foreground" />
            </span>
          </>
        )}
        <span>Device</span>
        <span className="flex min-w-0 justify-end">
          <DeviceLabel device={marker.device} iconSize={14} className="text-foreground" />
        </span>
      </div>
      {href && (
        <a
          href={href}
          onClick={e => {
            // Plain left-click navigates within the SPA; modified/middle clicks keep their
            // native open-in-new-tab behaviour (href is a real project-scoped route).
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
            e.preventDefault()
            navigate(href)
          }}
          className="mt-2.5 flex items-center justify-center gap-1 border-t border-border/40 pt-2.5 font-medium text-link underline-offset-4 hover:underline"
        >
          View profile →
        </a>
      )}
    </div>
  )
}

export const MarkerView = ({
  marker,
  selected,
  onSelect,
  profileHref,
}: {
  marker: VisitorMapMarker
  selected: boolean
  onSelect?: (distinctId: string) => void
  profileHref?: (distinctId: string) => string
}) => {
  const locationLabel = marker.region
    ? `${marker.region}, ${formatCountryName(marker.iso)}`
    : formatCountryName(marker.iso)

  return (
    <div className="group/marker relative">
      <button
        type="button"
        aria-label={`Visitor from ${locationLabel}`}
        title={locationLabel}
        onClick={() => onSelect?.(marker.distinctId)}
        className="block border-0 bg-transparent p-0"
      >
        <span
          className={`relative block rounded-full shadow-md transition-transform duration-200 group-hover/marker:scale-110 ${
            selected ? 'scale-110 shadow-success/50' : 'shadow-black/10'
          }`}
        >
          <Facehash
            name={marker.distinctId}
            size={32}
            showInitial={false}
            intensity3d="dramatic"
            interactive={false}
            colors={LIVE_AVATAR_COLORS}
            className="block rounded-full"
          />
        </span>
      </button>
      <div
        className={`absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded-xl border border-border/70 bg-background/90 p-3 shadow-[0_12px_32px_rgb(0_0_0/18%)] backdrop-blur-md transition-opacity ${
          selected ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover/marker:opacity-100'
        }`}
      >
        <MarkerPopover marker={marker} selected={selected} profileHref={profileHref} />
      </div>
    </div>
  )
}

export const ClusterView = ({
  cluster,
  onZoomTo,
}: {
  cluster: ClusterMapMarker
  onZoomTo?: (lng: number, lat: number) => void
}) => {
  const color = getSeriesColor(cluster.topKind).dot
  const place = cluster.region ? `${cluster.region}, ${formatCountryName(cluster.iso)}` : formatCountryName(cluster.iso)
  const size = cluster.count >= 50 ? 48 : cluster.count >= 20 ? 42 : 36

  return (
    <button
      type="button"
      title={`${cluster.count} visitors · ${place} — click to zoom in`}
      aria-label={`Zoom to ${cluster.count} visitors near ${place}`}
      onClick={() => onZoomTo?.(cluster.lng, cluster.lat)}
      style={{ width: size, height: size, borderColor: color }}
      className="flex items-center justify-center rounded-full border-2 bg-background/90 text-xs font-semibold text-foreground shadow-md backdrop-blur-sm transition-transform duration-200 hover:scale-110"
    >
      {cluster.count}
    </button>
  )
}
