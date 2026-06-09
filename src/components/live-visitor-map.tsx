import { Facehash } from 'facehash'
import maplibregl, {
  type ExpressionSpecification,
  type LayerSpecification,
  type PaddingOptions,
  type StyleSpecification,
} from 'maplibre-gl'
import themeLayers from 'protomaps-themes-base'
import { useEffect, useMemo, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { useMaplibreMap, useResolvedDark } from '@/hooks/use-maplibre-map'
import { buildVisitorMapMarkers, LIVE_AVATAR_COLORS, type VisitorMapMarker } from '@/lib/live-map-markers'
import { formatCountryName } from '@/lib/live-visitors'
import { ensurePmtilesProtocol, INITIAL_VIEW_BOUNDS } from '@/lib/maplibre'

type Props = {
  visitors: ActivityEvent[]
  selectedDistinctId?: string | null
  onSelectVisitor?: (distinctId: string) => void
  viewportPadding?: {
    left?: number
    right?: number
    top?: number
    bottom?: number
  }
}

const BASEMAP_SOURCE = 'protomaps'
const PMTILES_URL = `pmtiles://${typeof window !== 'undefined' ? window.location.origin : ''}/basemap.pmtiles`
const ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'

ensurePmtilesProtocol()

// protomaps-themes-base renders dual-line labels (preferred language on top, the local-script
// name on a second line — e.g. "Moscow\nМосква"). We want English only, so rewrite every label
// layer's text-field to name:en, falling back to the local name when a feature has no English tag.
const ENGLISH_NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name']]

const englishLabels = (layers: LayerSpecification[]) =>
  layers.map((layer) => {
    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) return layer
    return { ...layer, layout: { ...layer.layout, 'text-field': ENGLISH_NAME } }
  })

const buildBasemapStyle = (dark: boolean): StyleSpecification => ({
  version: 8,
  glyphs: `${window.location.origin}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    [BASEMAP_SOURCE]: {
      type: 'vector',
      url: PMTILES_URL,
      attribution: ATTRIBUTION,
    },
  },
  layers: englishLabels(themeLayers(BASEMAP_SOURCE, dark ? 'dark' : 'light', 'en')),
})

const resolvePadding = (padding: Props['viewportPadding']): PaddingOptions => ({
  left: padding?.left ?? 0,
  right: padding?.right ?? 0,
  top: padding?.top ?? 0,
  bottom: padding?.bottom ?? 0,
})

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

const MarkerView = ({
  marker,
  selected,
  onSelect,
}: {
  marker: VisitorMapMarker
  selected: boolean
  onSelect?: (distinctId: string) => void
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
        className="block cursor-pointer border-0 bg-transparent p-0"
      >
        <span
          className={`relative block rounded-full ring-2 shadow-md transition-transform duration-200 group-hover/marker:scale-110 ${
            selected ? 'scale-110 ring-emerald-500 shadow-emerald-500/50' : 'ring-white/90 shadow-black/10'
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
        <MarkerPopover marker={marker} />
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

type MarkerEntry = {
  marker: maplibregl.Marker
  root: Root
  data: VisitorMapMarker
  signature: string
}

const LiveVisitorMap = ({ visitors, selectedDistinctId = null, onSelectVisitor, viewportPadding }: Props) => {
  const dark = useResolvedDark()
  const markers = useMemo(() => buildVisitorMapMarkers(visitors), [visitors])

  const { containerRef, mapRef, ready } = useMaplibreMap({
    style: buildBasemapStyle(dark),
    center: [0, 10],
    zoom: 2,
    minZoom: 1,
    maxZoom: 8,
    renderWorldCopies: false,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: { compact: true },
  })

  const entriesRef = useRef(new Map<string, MarkerEntry>())
  const selectedRef = useRef(selectedDistinctId)
  const onSelectRef = useRef(onSelectVisitor)
  const paddingRef = useRef(resolvePadding(viewportPadding))
  paddingRef.current = resolvePadding(viewportPadding)

  useEffect(() => {
    onSelectRef.current = onSelectVisitor
  }, [onSelectVisitor])

  // Theme swap — restyle the basemap; DOM markers persist across setStyle.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setStyle(buildBasemapStyle(dark))
  }, [dark, ready, mapRef])

  // Keep basemap/tile load failures (e.g. a missing or invalid /basemap.pmtiles) non-fatal —
  // the visitor markers still render over a blank background instead of crashing the map.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const onError = (e: maplibregl.ErrorEvent) => console.warn('[live-map] basemap error:', e.error?.message ?? e.error)
    map.on('error', onError)
    return () => {
      map.off('error', onError)
    }
  }, [ready, mapRef])

  // Initial world fit (only when not focused on a visitor); refit on container resize.
  useEffect(() => {
    const map = mapRef.current
    const el = containerRef.current
    if (!map || !ready || !el) return

    // No maxBounds: constraining to the full world extent is degenerate and crashes MapLibre's
    // _calcMatrices (null transform matrix). World copies are off so the world doesn't repeat;
    // the initial fitBounds frames the single copy and minZoom keeps it filling the viewport.
    const fit = () => {
      map.resize()
      if (selectedRef.current) return
      map.fitBounds(INITIAL_VIEW_BOUNDS, { padding: paddingRef.current, animate: false })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ready, mapRef, containerRef])

  // Fly to the selected visitor.
  useEffect(() => {
    selectedRef.current = selectedDistinctId
    const map = mapRef.current
    if (!map || !ready) return

    for (const entry of entriesRef.current.values()) {
      entry.root.render(
        <MarkerView
          marker={entry.data}
          selected={entry.data.distinctId === selectedDistinctId}
          onSelect={onSelectRef.current}
        />,
      )
      entry.marker.getElement().style.zIndex = entry.data.distinctId === selectedDistinctId ? '20' : ''
    }

    if (!selectedDistinctId) return
    const target = entriesRef.current.get(selectedDistinctId)
    if (!target) return
    map.flyTo({
      center: [target.data.lng, target.data.lat],
      zoom: Math.max(map.getZoom(), 4),
      padding: paddingRef.current,
      duration: 700,
      essential: true,
    })
  }, [selectedDistinctId, ready, mapRef])

  // Reconcile markers in place as the visitor set changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const entries = entriesRef.current
    const nextIds = new Set<string>()

    for (const data of markers) {
      nextIds.add(data.distinctId)
      const selected = data.distinctId === selectedRef.current
      const existing = entries.get(data.distinctId)

      if (existing) {
        const nextSignature = markerSignature(data)
        if (existing.data.lat !== data.lat || existing.data.lng !== data.lng) {
          existing.marker.setLngLat([data.lng, data.lat])
        }
        if (existing.signature !== nextSignature) {
          existing.data = data
          existing.signature = nextSignature
          existing.root.render(<MarkerView marker={data} selected={selected} onSelect={onSelectRef.current} />)
        } else {
          existing.data = data
        }
        continue
      }

      const el = document.createElement('div')
      el.className = 'live-visitor-marker'
      const root = createRoot(el)
      root.render(<MarkerView marker={data} selected={selected} onSelect={onSelectRef.current} />)
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([data.lng, data.lat]).addTo(map)
      if (selected) marker.getElement().style.zIndex = '20'
      entries.set(data.distinctId, { marker, root, data, signature: markerSignature(data) })
    }

    for (const [id, entry] of entries) {
      if (nextIds.has(id)) continue
      entry.root.unmount()
      entry.marker.remove()
      entries.delete(id)
    }
  }, [markers, ready, mapRef])

  // Final teardown.
  useEffect(() => {
    const entries = entriesRef.current
    return () => {
      for (const entry of entries.values()) {
        entry.root.unmount()
        entry.marker.remove()
      }
      entries.clear()
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full" />
}

export default LiveVisitorMap
