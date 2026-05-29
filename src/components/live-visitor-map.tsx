import { Facehash } from 'facehash'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAtomValue } from 'jotai'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MapContainer, useMap } from 'react-leaflet'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { type Theme, themeAtom } from '@/data/theme.atoms'
import { buildVisitorMapMarkers, LIVE_AVATAR_COLORS, type VisitorMapMarker } from '@/lib/live-map-markers'
import { formatCountryName } from '@/lib/live-visitors'

type Props = {
  visitors: ActivityEvent[]
  focusedIso?: string | null
  selectedDistinctId?: string | null
  onSelectVisitor?: (distinctId: string) => void
  viewportPadding?: {
    left?: number
    right?: number
    top?: number
    bottom?: number
  }
}

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const CARTO_DARK_FILTER = 'brightness(1.55) contrast(0.82) saturate(0.85)'

const WORLD_BOUNDS = L.latLngBounds([-85, -180], [85, 180])
const INITIAL_VIEW_BOUNDS = L.latLngBounds([-55, -180], [75, 180])
const INITIAL_VIEW_CENTER: L.LatLngExpression = [10, 0]

const subscribeDark = (onStoreChange: () => void) => {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onStoreChange()
  mq.addEventListener('change', handler)
  const obs = new MutationObserver(handler)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => {
    mq.removeEventListener('change', handler)
    obs.disconnect()
  }
}

const getResolvedDark = (theme: Theme) => {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return document.documentElement.classList.contains('dark')
}

const useResolvedDark = () => {
  const theme = useAtomValue(themeAtom)
  return useSyncExternalStore(
    subscribeDark,
    () => getResolvedDark(theme),
    () => false,
  )
}

const BasemapLayer = ({ dark }: { dark: boolean }) => {
  const map = useMap()

  useEffect(() => {
    const layer = L.tileLayer(dark ? CARTO_DARK : CARTO_LIGHT, {
      noWrap: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    })
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [dark, map])

  return null
}

const resolvePadding = (padding: Props['viewportPadding']) => ({
  left: padding?.left ?? 0,
  right: padding?.right ?? 0,
  top: padding?.top ?? 0,
  bottom: padding?.bottom ?? 0,
})

const MapLayout = ({ enabled, viewportPadding }: { enabled: boolean; viewportPadding?: Props['viewportPadding'] }) => {
  const map = useMap()

  const fit = useCallback(() => {
    map.invalidateSize({ pan: false })
    if (!enabled) return
    const padding = resolvePadding(viewportPadding)
    const coverZoom = map.getBoundsZoom(
      INITIAL_VIEW_BOUNDS,
      true,
      L.point(padding.left + padding.right, padding.top + padding.bottom),
    )
    map.setView(INITIAL_VIEW_CENTER, coverZoom, { animate: false })
  }, [enabled, map, viewportPadding])

  useEffect(() => {
    map.setMaxBounds(WORLD_BOUNDS)
    map.options.worldCopyJump = false

    fit()
    const raf = requestAnimationFrame(fit)

    const container = map.getContainer()
    const observer = new ResizeObserver(() => fit())
    observer.observe(container)
    window.addEventListener('resize', fit)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [fit, map])

  return null
}

const MapFocus = ({
  markers,
  focusedIso,
  selectedDistinctId,
  viewportPadding,
}: {
  markers: VisitorMapMarker[]
  focusedIso: string | null
  selectedDistinctId: string | null
  viewportPadding?: Props['viewportPadding']
}) => {
  const map = useMap()

  useEffect(() => {
    const target =
      (selectedDistinctId && markers.find(m => m.distinctId === selectedDistinctId)) ||
      (focusedIso && markers.find(m => m.iso === focusedIso)) ||
      null
    if (!target) return
    const padding = resolvePadding(viewportPadding)
    map.flyToBounds(L.latLngBounds([target.lat, target.lng], [target.lat, target.lng]), {
      maxZoom: Math.max(map.getZoom(), 4),
      paddingTopLeft: [padding.left, padding.top],
      paddingBottomRight: [padding.right, padding.bottom],
      duration: 0.7,
    })
  }, [focusedIso, selectedDistinctId, markers, map, viewportPadding])

  return null
}

const MarkerPopover = ({ marker }: { marker: VisitorMapMarker }) => {
  const country = formatCountryName(marker.iso)
  const location = [marker.city, marker.region, country].filter(Boolean).join(', ')

  return (
    <div className="w-56 text-xs">
      <div className="mb-2">
        <div className="truncate text-sm font-semibold text-foreground">{marker.page}</div>
        <div className="truncate text-muted-foreground">{location || country}</div>
      </div>
      <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-muted-foreground">
        {marker.browser && (
          <>
            <span>Browser</span>
            <span className="min-w-0 truncate text-right text-foreground">{marker.browser}</span>
          </>
        )}
        <span>Device</span>
        <span className="min-w-0 truncate text-right text-foreground">{marker.device}</span>
        {marker.region && (
          <>
            <span>Region</span>
            <span className="min-w-0 truncate text-right text-foreground">{marker.region}</span>
          </>
        )}
        <span>Country</span>
        <span className="min-w-0 truncate text-right text-foreground">{country}</span>
      </div>
    </div>
  )
}

const markerSignature = (marker: VisitorMapMarker) =>
  [
    marker.iso,
    marker.region ?? '',
    marker.city ?? '',
    marker.page,
    marker.browser ?? '',
    marker.device,
    marker.lat.toFixed(6),
    marker.lng.toFixed(6),
  ].join('|')

const AvatarMarkerLayer = ({
  markers,
  selectedDistinctId,
  onSelectVisitor,
}: {
  markers: VisitorMapMarker[]
  selectedDistinctId: string | null
  onSelectVisitor?: (distinctId: string) => void
}) => {
  const map = useMap()
  const onSelectRef = useRef(onSelectVisitor)
  const selectedRef = useRef(selectedDistinctId)
  const entriesRef = useRef<
    Map<
      string,
      {
        marker: L.Marker
        root: Root
        popupRoot: Root
        data: VisitorMapMarker
        signature: string
      }
    >
  >(new Map())

  useEffect(() => {
    onSelectRef.current = onSelectVisitor
  }, [onSelectVisitor])

  useEffect(() => {
    const entries = entriesRef.current
    selectedRef.current = selectedDistinctId

    for (const entry of entries.values()) {
      const selected = entry.data.distinctId === selectedDistinctId
      renderMarker(entry.root, entry.data, selected, onSelectRef)
      if (selected) entry.marker.openPopup()
      else entry.marker.closePopup()
    }
  }, [selectedDistinctId])

  useEffect(() => {
    const entries = entriesRef.current
    const nextIds = new Set<string>()

    for (const markerData of markers) {
      nextIds.add(markerData.distinctId)
      const selected = markerData.distinctId === selectedRef.current
      const existing = entries.get(markerData.distinctId)

      if (existing) {
        const nextSignature = markerSignature(markerData)
        const moved = existing.data.lat !== markerData.lat || existing.data.lng !== markerData.lng
        existing.data = markerData
        if (moved) existing.marker.setLatLng([markerData.lat, markerData.lng])
        if (existing.signature !== nextSignature) {
          existing.popupRoot.render(<MarkerPopover marker={markerData} />)
          renderMarker(existing.root, markerData, selected, onSelectRef)
          existing.signature = nextSignature
        }
        if (selected) existing.marker.openPopup()
        continue
      }

      const signature = markerSignature(markerData)
      const markerEl = document.createElement('div')
      const root = createRoot(markerEl)
      renderMarker(root, markerData, selected, onSelectRef)

      const icon = L.divIcon({
        className: 'live-visitor-marker',
        html: markerEl,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })
      const marker = L.marker([markerData.lat, markerData.lng], { icon })
      const popupEl = document.createElement('div')
      const popupRoot = createRoot(popupEl)
      popupRoot.render(<MarkerPopover marker={markerData} />)
      marker.bindPopup(popupEl, {
        closeButton: false,
        className: 'live-visitor-popup',
        offset: [0, -14],
        autoPan: false,
      })

      const entry = { marker, root, popupRoot, data: markerData, signature }
      marker.on('mouseover focus', () => marker.openPopup())
      marker.on('mouseout blur', () => {
        if (entry.data.distinctId !== selectedRef.current) marker.closePopup()
      })
      marker.addTo(map)
      if (selected) marker.openPopup()
      entries.set(markerData.distinctId, entry)
    }

    for (const [id, entry] of entries) {
      if (nextIds.has(id)) continue
      entry.root.unmount()
      entry.popupRoot.unmount()
      entry.marker.remove()
      entries.delete(id)
    }
  }, [map, markers])

  useEffect(() => {
    const entries = entriesRef.current
    return () => {
      for (const entry of entries.values()) {
        entry.root.unmount()
        entry.popupRoot.unmount()
        entry.marker.remove()
      }
      entries.clear()
    }
  }, [])

  return null
}

const renderMarker = (
  root: Root,
  marker: VisitorMapMarker,
  selected: boolean,
  onSelectRef: React.RefObject<((distinctId: string) => void) | undefined>,
) => {
  const locationLabel = marker.region
    ? `${marker.region}, ${formatCountryName(marker.iso)}`
    : formatCountryName(marker.iso)
  root.render(
    <button
      type="button"
      aria-label={`Visitor from ${locationLabel}`}
      title={locationLabel}
      onClick={() => onSelectRef.current?.(marker.distinctId)}
      className="group/marker block cursor-pointer border-0 bg-transparent p-0"
    >
      <span
        className={`relative block rounded-full ring-2 shadow-md transition-transform duration-200 group-hover/marker:scale-110 ${
          selected ? 'z-20 scale-110 ring-emerald-500 shadow-emerald-500/50' : 'z-10 ring-white/90 shadow-black/10'
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
    </button>,
  )
}

const LiveVisitorMap = ({
  visitors,
  focusedIso = null,
  selectedDistinctId = null,
  onSelectVisitor,
  viewportPadding,
}: Props) => {
  const dark = useResolvedDark()
  const markers = useMemo(() => buildVisitorMapMarkers(visitors), [visitors])
  const hasFocus = Boolean(selectedDistinctId || focusedIso)
  const mapStyle = {
    '--live-map-tile-filter': dark ? CARTO_DARK_FILTER : 'none',
  } as CSSProperties

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={1}
      maxZoom={8}
      zoomSnap={0.05}
      zoomDelta={0.5}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1}
      zoomControl={false}
      scrollWheelZoom
      className="absolute inset-0 z-0 h-full w-full"
      style={mapStyle}
    >
      <BasemapLayer dark={dark} />
      <MapLayout enabled={!hasFocus} viewportPadding={viewportPadding} />
      <MapFocus
        markers={markers}
        focusedIso={focusedIso ?? null}
        selectedDistinctId={selectedDistinctId ?? null}
        viewportPadding={viewportPadding}
      />
      <AvatarMarkerLayer
        markers={markers}
        selectedDistinctId={selectedDistinctId ?? null}
        onSelectVisitor={onSelectVisitor}
      />
    </MapContainer>
  )
}

export default LiveVisitorMap
