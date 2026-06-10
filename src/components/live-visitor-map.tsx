import { Facehash } from 'facehash'
import maplibregl, {
  type ExpressionSpecification,
  type LayerSpecification,
  type PaddingOptions,
  type StyleSpecification,
} from 'maplibre-gl'
import themeLayers from 'protomaps-themes-base'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { useMaplibreMap, useResolvedDark } from '@/hooks/use-maplibre-map'
import { getSeriesColor } from '@/lib/event-colors'
import {
  buildMapEntries,
  buildVisitorMapMarkers,
  type ClusterMapMarker,
  LIVE_AVATAR_COLORS,
  type MapEntry,
  type VisitorMapMarker,
} from '@/lib/live-map-markers'
import { formatCountryName } from '@/lib/live-visitors'
import { ensurePmtilesProtocol, INITIAL_VIEW_BOUNDS, mapAssetsOrigin } from '@/lib/maplibre'

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
const PMTILES_URL = `pmtiles://${mapAssetsOrigin()}/basemap.pmtiles`
const ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'

const FADE_MS = 280

ensurePmtilesProtocol()

// protomaps-themes-base renders dual-line labels (preferred language on top, the local-script
// name on a second line — e.g. "Moscow\nМосква"). We want English only, so rewrite every label
// layer's text-field to name:en, falling back to the local name when a feature has no English tag.
const ENGLISH_NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name']]

const englishLabels = (layers: LayerSpecification[]) =>
  layers.map(layer => {
    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) return layer
    return { ...layer, layout: { ...layer.layout, 'text-field': ENGLISH_NAME } }
  })

const buildBasemapStyle = (dark: boolean): StyleSpecification => ({
  version: 8,
  glyphs: `${mapAssetsOrigin()}/fonts/{fontstack}/{range}.pbf`,
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
  const color = getSeriesColor(marker.kind).dot

  return (
    <div className="w-56 text-xs">
      <div className="mb-2">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate font-medium text-foreground">{marker.kind}</span>
        </div>
        {marker.page && marker.page !== '—' && <div className="truncate text-muted-foreground">{marker.page}</div>}
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
          className={`relative block rounded-full shadow-md transition-transform duration-200 group-hover/marker:scale-110 ${
            selected ? 'scale-110 shadow-emerald-500/50' : 'shadow-black/10'
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

const ClusterView = ({ cluster, onExpand }: { cluster: ClusterMapMarker; onExpand: () => void }) => {
  const color = getSeriesColor(cluster.topKind).dot
  const place = cluster.region ? `${cluster.region}, ${formatCountryName(cluster.iso)}` : formatCountryName(cluster.iso)
  const size = cluster.count >= 50 ? 48 : cluster.count >= 20 ? 42 : 36

  return (
    <button
      type="button"
      onClick={onExpand}
      title={`${cluster.count} visitors · ${place}`}
      aria-label={`${cluster.count} visitors near ${place}. Expand.`}
      style={{ width: size, height: size, borderColor: color }}
      className="flex cursor-pointer items-center justify-center rounded-full border-2 bg-background/90 text-xs font-semibold text-foreground shadow-md backdrop-blur-sm transition-transform hover:scale-110"
    >
      {cluster.count}
    </button>
  )
}

type Entry = {
  marker: maplibregl.Marker
  root: Root
  data: MapEntry
  signature: string
}

const entryId = (entry: MapEntry) => (entry.type === 'cluster' ? `cluster:${entry.groupKey}` : entry.distinctId)

const entrySignature = (entry: MapEntry, selectedId: string | null) => {
  if (entry.type === 'cluster')
    return `c|${entry.count}|${entry.topKind}|${entry.lat.toFixed(4)}|${entry.lng.toFixed(4)}`
  return [
    'v',
    entry.distinctId === selectedId ? 'sel' : '',
    entry.kind,
    entry.iso,
    entry.region ?? '',
    entry.city ?? '',
    entry.page,
    entry.browser ?? '',
    entry.device,
    entry.lat.toFixed(6),
    entry.lng.toFixed(6),
  ].join('|')
}

const LiveVisitorMap = ({ visitors, selectedDistinctId = null, onSelectVisitor, viewportPadding }: Props) => {
  const dark = useResolvedDark()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  // Coordinates + group for every visitor regardless of clustering — used to fly to a selection
  // and to auto-expand the cluster that contains it.
  const visitorIndex = useMemo(() => {
    const index = new Map<string, VisitorMapMarker>()
    for (const m of buildVisitorMapMarkers(visitors)) index.set(m.distinctId, m)
    return index
  }, [visitors])

  const entries = useMemo(() => buildMapEntries(visitors, { expanded }), [visitors, expanded])

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

  const entriesRef = useRef(new Map<string, Entry>())
  const selectedRef = useRef(selectedDistinctId)
  const onSelectRef = useRef(onSelectVisitor)
  const paddingRef = useRef(resolvePadding(viewportPadding))
  paddingRef.current = resolvePadding(viewportPadding)

  useEffect(() => {
    onSelectRef.current = onSelectVisitor
  }, [onSelectVisitor])

  const expandGroup = useCallback((groupKey: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.add(groupKey)
      return next
    })
  }, [])

  const renderEntry = useCallback(
    (root: Root, entry: MapEntry, selectedId: string | null) => {
      if (entry.type === 'cluster') {
        root.render(<ClusterView cluster={entry} onExpand={() => expandGroup(entry.groupKey)} />)
        return
      }
      root.render(
        <MarkerView marker={entry} selected={entry.distinctId === selectedId} onSelect={onSelectRef.current} />,
      )
    },
    [expandGroup],
  )

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

  // Fly to the selected visitor, expanding its cluster so the face is visible.
  useEffect(() => {
    selectedRef.current = selectedDistinctId
    const map = mapRef.current
    if (!map || !ready) return

    for (const entry of entriesRef.current.values()) {
      if (entry.data.type === 'visitor') {
        entry.marker.getElement().style.zIndex = entry.data.distinctId === selectedDistinctId ? '20' : ''
      }
    }

    if (!selectedDistinctId) return
    const target = visitorIndex.get(selectedDistinctId)
    if (!target) return
    if (!expanded.has(target.groupKey)) expandGroup(target.groupKey)
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: Math.max(map.getZoom(), 4),
      padding: paddingRef.current,
      duration: 700,
      essential: true,
    })
  }, [selectedDistinctId, ready, mapRef, visitorIndex, expanded, expandGroup])

  // Reconcile map entries (visitors + clusters) in place, fading arrivals in and departures out.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const live = entriesRef.current
    const nextIds = new Set<string>()

    for (const data of entries) {
      const id = entryId(data)
      nextIds.add(id)
      const signature = entrySignature(data, selectedRef.current)
      const existing = live.get(id)

      if (existing) {
        if (existing.data.lat !== data.lat || existing.data.lng !== data.lng) {
          existing.marker.setLngLat([data.lng, data.lat])
        }
        if (existing.signature !== signature) {
          existing.data = data
          existing.signature = signature
          renderEntry(existing.root, data, selectedRef.current)
        }
        continue
      }

      const el = document.createElement('div')
      el.className = 'live-visitor-marker'
      el.style.opacity = '0'
      el.style.transition = `opacity ${FADE_MS}ms ease`
      const root = createRoot(el)
      renderEntry(root, data, selectedRef.current)
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([data.lng, data.lat]).addTo(map)
      if (data.type === 'visitor' && data.distinctId === selectedRef.current) el.style.zIndex = '20'
      requestAnimationFrame(() => {
        el.style.opacity = '1'
      })
      live.set(id, { marker, root, data, signature })
    }

    for (const [id, entry] of live) {
      if (nextIds.has(id)) continue
      live.delete(id)
      const el = entry.marker.getElement()
      el.style.opacity = '0'
      window.setTimeout(() => {
        entry.root.unmount()
        entry.marker.remove()
      }, FADE_MS)
    }
  }, [entries, ready, mapRef, renderEntry])

  // Drop expanded groups that no longer exist so the set can't grow unbounded.
  useEffect(() => {
    setExpanded(prev => {
      if (!prev.size) return prev
      const groups = new Set<string>()
      for (const m of visitorIndex.values()) groups.add(m.groupKey)
      let changed = false
      const next = new Set<string>()
      for (const key of prev) {
        if (groups.has(key)) next.add(key)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [visitorIndex])

  // Final teardown.
  useEffect(() => {
    const live = entriesRef.current
    return () => {
      for (const entry of live.values()) {
        entry.root.unmount()
        entry.marker.remove()
      }
      live.clear()
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full" />
}

export default LiveVisitorMap
