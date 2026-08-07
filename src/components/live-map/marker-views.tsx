import IdentityAvatar from '@/components/identity-avatar'
import type { ClusterMapMarker, VisitorMapMarker } from '@/components/live-map/markers'
import { getSeriesColor } from '@/lib/event-colors'
import { formatLocationLabel } from '@/lib/location'

export const MARKER_SIZE = 32

export const clusterSize = (count: number) => {
  if (count >= 50) return 48
  if (count >= 20) return 42
  return 36
}

// The event's own colour when pinned, neutral when the pointer is on their panel row. Inline because
// ring utilities can't take a runtime colour.
const haloFor = (kind: string, selected: boolean, highlighted: boolean) => {
  if (selected) return `0 0 0 2px var(--background), 0 0 0 4px ${getSeriesColor(kind).dot}`
  if (highlighted) return '0 0 0 2px var(--background), 0 0 0 3px var(--ring)'
  return '0 2px 6px rgb(0 0 0 / 12%)'
}

export const MarkerView = ({
  marker,
  selected,
  highlighted,
  onSelect,
}: {
  marker: VisitorMapMarker
  selected: boolean
  highlighted: boolean
  onSelect?: (distinctId: string) => void
}) => {
  const locationLabel = formatLocationLabel(undefined, marker.region, marker.iso)

  return (
    <button
      type="button"
      aria-label={`Visitor from ${locationLabel}`}
      onClick={() => onSelect?.(marker.distinctId)}
      className="group/marker block border-0 bg-transparent p-0"
    >
      {/* Sized off MARKER_SIZE rather than a class — the placement solver reads it as the anchor
          radius, so a class here would drift out from under the popover. */}
      <span
        className={`relative block rounded-full transition-transform duration-200 group-hover/marker:scale-110 ${
          selected || highlighted ? 'scale-110' : ''
        }`}
        style={{ width: MARKER_SIZE, height: MARKER_SIZE, boxShadow: haloFor(marker.kind, selected, highlighted) }}
      >
        <IdentityAvatar id={marker.distinctId} src={marker.avatarUrl} className="block size-full rounded-full" />
      </span>
    </button>
  )
}

export const ClusterView = ({
  cluster,
  onZoomTo,
}: {
  cluster: ClusterMapMarker
  onZoomTo?: (lng: number, lat: number) => void
}) => {
  const place = formatLocationLabel(undefined, cluster.region, cluster.iso)
  const size = clusterSize(cluster.count)

  return (
    <button
      type="button"
      aria-label={`Zoom to ${cluster.count} visitors near ${place}`}
      onClick={() => onZoomTo?.(cluster.lng, cluster.lat)}
      style={{ width: size, height: size, borderColor: getSeriesColor(cluster.topKind).dot }}
      className="flex items-center justify-center rounded-full border-2 bg-background/90 text-xs font-semibold text-foreground shadow-md backdrop-blur-sm transition-transform duration-200 hover:scale-110"
    >
      {cluster.count}
    </button>
  )
}
