import maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { ClusterView, MarkerView } from '@/components/live-map/marker-views'
import { useMaplibreMap, useResolvedDark } from '@/hooks/use-maplibre-map'
import { buildBasemapStyle, resolvePadding, type ViewportPadding } from '@/lib/live-map/basemap'
import { buildMapEntries, buildVisitorMapMarkers, type MapEntry, type VisitorMapMarker } from '@/lib/live-map/markers'
import { DECLUSTER_ZOOM, displayPos, scatterCellDeg } from '@/lib/live-map/scatter'
import { INITIAL_VIEW_BOUNDS } from '@/lib/maplibre'

type Props = {
  visitors: ActivityEvent[]
  selectedDistinctId?: string | null
  onSelectVisitor?: (distinctId: string) => void
  viewportPadding?: ViewportPadding
}

const FADE_MS = 280

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
  // Zoom past DECLUSTER_ZOOM breaks crowded city groups into individual faces.
  const [declustered, setDeclustered] = useState(false)

  // Coordinates for every visitor regardless of clustering — used to fly to a selection.
  const visitorIndex = useMemo(() => {
    const index = new Map<string, VisitorMapMarker>()
    for (const m of buildVisitorMapMarkers(visitors)) index.set(m.distinctId, m)
    return index
  }, [visitors])

  const entries = useMemo(
    () => buildMapEntries(visitors, { threshold: declustered ? Number.POSITIVE_INFINITY : 6 }),
    [visitors, declustered],
  )

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

  // Clicking a count badge flies to that city and zooms past DECLUSTER_ZOOM so the cluster breaks into
  // individual faces. Held in a ref so renderEntry stays stable across renders.
  const zoomToClusterRef = useRef((lng: number, lat: number) => {
    const map = mapRef.current
    if (!map) return
    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom() + 2, DECLUSTER_ZOOM + 1),
      padding: paddingRef.current,
      duration: 700,
      essential: true,
    })
  })

  const renderEntry = useCallback((root: Root, entry: MapEntry, selectedId: string | null) => {
    if (entry.type === 'cluster') {
      root.render(<ClusterView cluster={entry} onZoomTo={zoomToClusterRef.current} />)
      return
    }
    root.render(<MarkerView marker={entry} selected={entry.distinctId === selectedId} onSelect={onSelectRef.current} />)
  }, [])

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

  // Fly to the selected visitor.
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
    map.flyTo({
      center: [target.lng, target.lat],
      // Past the declustering zoom so the selected face is revealed, never inside a count badge.
      zoom: Math.max(map.getZoom(), DECLUSTER_ZOOM + 0.5),
      padding: paddingRef.current,
      duration: 700,
      essential: true,
    })
  }, [selectedDistinctId, ready, mapRef, visitorIndex])

  // Reconcile map entries (visitors + clusters) in place, fading arrivals in and departures out.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const live = entriesRef.current
    const nextIds = new Set<string>()
    const cell = scatterCellDeg(map.getZoom())

    for (const data of entries) {
      const id = entryId(data)
      nextIds.add(id)
      const signature = entrySignature(data, selectedRef.current)
      const existing = live.get(id)

      if (existing) {
        existing.data = data
        existing.marker.setLngLat(displayPos(data, cell))
        if (existing.signature !== signature) {
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
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(displayPos(data, cell))
        .addTo(map)
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

  // As the user zooms: reposition faces so the fan's on-screen gap tracks cellPxForZoom (tighter at the
  // overview zoom, wider as you zoom in; collapses onto the coordinate when zoomed out), and flip
  // declustering when crossing DECLUSTER_ZOOM.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const onZoom = () => {
      const zoom = map.getZoom()
      const cell = scatterCellDeg(zoom)
      for (const entry of entriesRef.current.values()) {
        if (entry.data.type === 'visitor') entry.marker.setLngLat(displayPos(entry.data, cell))
      }
      setDeclustered(prev => {
        const next = zoom >= DECLUSTER_ZOOM
        return next === prev ? prev : next
      })
    }
    onZoom()
    map.on('zoom', onZoom)
    return () => {
      map.off('zoom', onZoom)
    }
  }, [ready, mapRef])

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
