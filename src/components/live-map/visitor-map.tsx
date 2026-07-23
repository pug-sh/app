import maplibregl, { type PaddingOptions } from 'maplibre-gl'
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { buildBasemapStyle } from '@/components/live-map/basemap'
import { EMPTY_JOURNEY } from '@/components/live-map/live-visitors'
import { ClusterPopover, POPOVER_SURFACE, VisitorPopover } from '@/components/live-map/map-popover'
import { ClusterView, clusterSize, MARKER_SIZE, MarkerView } from '@/components/live-map/marker-views'
import { buildGroups, groupsToEntries, groupsToPoints, type MapEntry } from '@/components/live-map/markers'
import { type Placement, type Rect, resolvePlacement } from '@/components/live-map/popover-placement'
import { DECLUSTER_ZOOM, displayPos, scatterCellDeg } from '@/components/live-map/scatter'
import { useMaplibreMap, useResolvedDark } from '@/hooks/use-maplibre-map'
import { INITIAL_VIEW_BOUNDS } from '@/lib/maplibre'

type Props = {
  visitors: ActivityEvent[]
  selectedDistinctId?: string | null
  onSelectVisitor?: (distinctId: string) => void
  profileHref?: (distinctId: string) => string
  journeyFor?: (distinctId: string) => ActivityEvent[]
  // Whoever the panel's pointer is on — rings their marker so a row can be located on the map.
  highlightedDistinctId?: string | null
  // Reports the marker under the pointer, so the panel can answer the same question in reverse.
  onHoverVisitor?: (distinctId: string | null) => void
  // Panel(s) floating over the map. The popover treats them as solid and steps out from under them.
  avoidRef?: RefObject<HTMLElement | null>
  viewportPadding?: PaddingOptions
}

const FADE_MS = 280
const HOVER_IN_MS = 60
// Long enough to cross the gap between a face and its popover without the popover closing underneath
// the pointer, and to sweep across a fanned-out city without the popover strobing.
const HOVER_OUT_MS = 180
const ARROW_PX = 10

type Entry = {
  marker: maplibregl.Marker
  root: Root
  data: MapEntry
  signature: string
}

const entryId = (entry: MapEntry) => (entry.type === 'cluster' ? `cluster:${entry.groupKey}` : entry.distinctId)

// Gates whether an entry's React content is re-rendered, so it has to cover everything the marker
// paints or reads — including iso/region, which feed its aria-label. Position is excluded: it's
// reapplied every reconcile via setLngLat.
const entrySignature = (entry: MapEntry, selectedId: string | null, highlightedId: string | null) => {
  // lng/lat are in here because ClusterView closes over them as its zoom target.
  if (entry.type === 'cluster') return `c|${entry.count}|${entry.topKind}|${entry.lng}|${entry.lat}`
  return [
    'v',
    entry.distinctId === selectedId ? 'sel' : '',
    entry.distinctId === highlightedId ? 'hl' : '',
    entry.kind,
    entry.iso,
    entry.region ?? '',
    entry.avatarUrl ?? '',
  ].join('|')
}

// Pinned and pointed-at markers rise above their neighbours, the pointer's target highest — its halo
// is the thinner of the two and would otherwise be hidden under a face beside it.
const stackFor = (id: string, selectedId: string | null, highlightedId: string | null) => {
  if (id === highlightedId) return '25'
  if (id === selectedId) return '20'
  return ''
}

const toLocalRect = (target: DOMRect, container: DOMRect): Rect => ({
  x: target.left - container.left,
  y: target.top - container.top,
  width: target.width,
  height: target.height,
})

// The scale pivot: the popover's own point of contact with the marker.
const originFor = ({ side, arrow }: Placement) => {
  const along = arrow === null ? '50%' : `${Math.round(arrow)}px`
  if (side === 'top') return `${along} 100%`
  if (side === 'bottom') return `${along} 0%`
  return side === 'left' ? `100% ${along}` : `0% ${along}`
}

// Live, so a mid-session preference change is picked up without re-querying on every open and close.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

// Opening reads as the card unfolding from the face; closing is faster and shallower, since an exit
// that lingers reads as lag.
const growKeyframes = (direction: 'in' | 'out'): [Keyframe[], KeyframeAnimationOptions] => {
  const shy = { opacity: 0, transform: direction === 'in' ? 'scale(0.85)' : 'scale(0.94)' }
  const full = { opacity: 1, transform: 'scale(1)' }
  const frames = direction === 'in' ? [shy, full] : [full, shy]

  // Reduced motion keeps the fade — it's what tells you the popover changed subject — and drops the
  // travel.
  if (reducedMotion.matches) {
    for (const frame of frames) frame.transform = 'none'
  }

  return [
    frames,
    direction === 'in'
      ? { duration: 200, easing: 'cubic-bezier(0.33, 1, 0.68, 1)', fill: 'backwards' }
      : { duration: 120, easing: 'ease-in', fill: 'forwards' },
  ]
}

const LiveVisitorMap = ({
  visitors,
  selectedDistinctId = null,
  onSelectVisitor,
  profileHref,
  journeyFor,
  highlightedDistinctId = null,
  onHoverVisitor,
  avoidRef,
  viewportPadding,
}: Props) => {
  const dark = useResolvedDark()
  // Zoom past DECLUSTER_ZOOM breaks crowded city groups into individual faces.
  const [declustered, setDeclustered] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Resolve + group visitors once per data change; both projections below derive from this so the
  // expensive GeoIP/centroid grouping runs a single time per poll (not once per consumer).
  const groups = useMemo(() => buildGroups(visitors), [visitors])

  // Coordinates for every visitor regardless of clustering — used to fly to a selection.
  const visitorIndex = useMemo(() => groupsToPoints(groups), [groups])

  const entries = useMemo(
    () => groupsToEntries(groups, { threshold: declustered ? Number.POSITIVE_INFINITY : 6 }),
    [groups, declustered],
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
  const exitingRef = useRef(new Map<number, Entry>())
  const selectedRef = useRef(selectedDistinctId)
  const onSelectRef = useRef(onSelectVisitor)
  const avoidRefRef = useRef(avoidRef)
  avoidRefRef.current = avoidRef
  const paddingRef = useRef(viewportPadding)
  paddingRef.current = viewportPadding
  // Set when the selection came from clicking a face on the map: the face is already visible and
  // under the pointer, so flying the viewport to it would only yank the map out from under the click.
  const suppressFlyRef = useRef(false)
  const flownToRef = useRef<string | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelectVisitor
  }, [onSelectVisitor])

  // ── Popover subject ────────────────────────────────────────────────────────
  // Hover wins over the pinned selection, so peeking at a neighbour doesn't cost you your pin.

  const activeId = hoveredId ?? selectedDistinctId
  const activeEntry = useMemo(
    () => (activeId ? (entries.find(e => entryId(e) === activeId) ?? null) : null),
    [entries, activeId],
  )

  const lastPinnedRef = useRef<Extract<MapEntry, { type: 'visitor' }> | null>(null)
  useEffect(() => {
    if (activeEntry?.type === 'visitor' && activeEntry.distinctId === selectedDistinctId)
      lastPinnedRef.current = activeEntry
  }, [activeEntry, selectedDistinctId])

  // A pinned visitor who aged out keeps their popover, held where they were last seen. Absent from
  // visitorIndex is genuinely gone; absent from `entries` alone only means they're inside a cluster —
  // and gone from visitorIndex implies gone from `entries`, so `activeEntry` is already null here.
  // Holds the ref's own object: the effect below setStates on this, so it must keep its identity.
  const ghost = lastPinnedRef.current
  const pinnedGhost =
    ghost && !hoveredId && ghost.distinctId === selectedDistinctId && !visitorIndex.has(ghost.distinctId) ? ghost : null

  const popoverEntry = activeEntry ?? pinnedGhost

  // What's on screen outlives its subject by one exit animation, so it's held in state rather than
  // rendered straight off the derived value.
  const [rendered, setRendered] = useState(popoverEntry)
  const popoverEntryRef = useRef(rendered)
  popoverEntryRef.current = rendered
  const renderedId = rendered ? entryId(rendered) : null

  const journey = useMemo(() => {
    if (rendered?.type !== 'visitor' || !journeyFor) return EMPTY_JOURNEY
    return journeyFor(rendered.distinctId)
  }, [rendered, journeyFor])

  // ── Popover placement ──────────────────────────────────────────────────────

  const popoverRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLSpanElement>(null)

  // Written straight to the DOM rather than through state: `move` fires every frame of a pan and of
  // the 700ms flyTo, and re-rendering the popover's whole subtree per frame to move a box is waste.
  const place = useCallback(() => {
    const map = mapRef.current
    const wrapper = popoverRef.current
    const body = bodyRef.current
    const container = containerRef.current
    const entry = popoverEntryRef.current
    if (!map || !wrapper || !body || !container || !entry) return

    const [lng, lat] = displayPos(entry, scatterCellDeg(map.getZoom()))
    const point = map.project([lng, lat])
    const bounds = container.getBoundingClientRect()
    const avoid = avoidRefRef.current?.current
    // Measured up front and reused below: reading these again after the style writes would force a
    // synchronous reflow on every frame of a pan.
    const width = body.offsetWidth
    const height = body.offsetHeight
    const placement = resolvePlacement({
      anchor: { x: point.x, y: point.y },
      anchorRadius: entry.type === 'cluster' ? clusterSize(entry.count) / 2 : MARKER_SIZE / 2,
      popover: { width, height },
      container: { width: bounds.width, height: bounds.height },
      obstacles: avoid ? [toLocalRect(avoid.getBoundingClientRect(), bounds)] : [],
    })

    wrapper.style.transform = `translate3d(${Math.round(placement.x)}px, ${Math.round(placement.y)}px, 0)`

    const surface = surfaceRef.current
    if (surface) surface.style.transformOrigin = originFor(placement)

    const arrow = arrowRef.current
    if (!arrow) return
    if (placement.arrow === null) {
      arrow.style.display = 'none'
      return
    }
    arrow.style.display = ''
    const half = ARROW_PX / 2
    const along = `${Math.round(placement.arrow - half)}px`
    if (placement.side === 'top' || placement.side === 'bottom') {
      arrow.style.left = along
      arrow.style.top = placement.side === 'top' ? `${height - half}px` : `${-half}px`
      return
    }
    arrow.style.top = along
    arrow.style.left = placement.side === 'left' ? `${width - half}px` : `${-half}px`
  }, [mapRef, containerRef])

  // Before paint, so the popover never shows a frame at the container's top-left corner.
  useLayoutEffect(place, [place, rendered, journey])

  // Grow in from the marker on every change of subject — but not on a poll, which hands back a fresh
  // entry object for the same visitor. Layout effect so the opening frame is never painted at rest.
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !renderedId || typeof surface.animate !== 'function') return
    surface.style.opacity = '0'
    const enter = surface.animate(...growKeyframes('in'))
    enter.onfinish = () => {
      surface.style.opacity = ''
    }
    return () => {
      enter.cancel()
      surface.style.opacity = ''
    }
  }, [renderedId])

  // Shrink back into it on the way out, holding the subject until the animation lands.
  useEffect(() => {
    if (popoverEntry) {
      setRendered(popoverEntry)
      return
    }
    const surface = surfaceRef.current
    if (!surface || typeof surface.animate !== 'function') {
      setRendered(null)
      return
    }
    const exit = surface.animate(...growKeyframes('out'))
    exit.onfinish = () => setRendered(null)
    return () => exit.cancel()
  }, [popoverEntry])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver(place)
    observer.observe(body)
    return () => observer.disconnect()
    // Keyed on the id, not the entry: a poll hands back a fresh object for the same subject, and the
    // body element it observes isn't remounted for that.
  }, [place, renderedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let frame = 0
    const run = () => {
      frame = 0
      place()
    }
    const onMove = () => {
      if (!frame) frame = requestAnimationFrame(run)
    }
    map.on('move', onMove)
    return () => {
      map.off('move', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ready, mapRef, place])

  // ── Hover intent ───────────────────────────────────────────────────────────

  const hoverTimer = useRef(0)
  const setHover = useCallback((id: string | null) => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHoveredId(id), id ? HOVER_IN_MS : HOVER_OUT_MS)
  }, [])
  const holdHover = useCallback(() => window.clearTimeout(hoverTimer.current), [])

  // Stable, and the id comes off the element rather than a closure — a per-marker arrow function
  // would capture the reconcile pass that created it and pin that whole poll's data for as long as
  // the marker lives.
  const onMarkerEnter = useCallback(
    (e: Event) => setHover((e.currentTarget as HTMLElement).dataset.entryId ?? null),
    [setHover],
  )
  const onMarkerLeave = useCallback(() => setHover(null), [setHover])

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])

  // A marker removed under the pointer never fires mouseleave, which would otherwise wedge the
  // popover shut: a hover id that matches nothing blocks both the active entry and the pinned ghost.
  useEffect(() => {
    setHoveredId(prev => (prev && !entries.some(e => entryId(e) === prev) ? null : prev))
  }, [entries])

  // Esc clears the pin, matching the panel's Reset.
  useEffect(() => {
    if (!selectedDistinctId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // A focused field or an open dropdown owns Escape first.
      const el = e.target as HTMLElement | null
      if (el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '')) return
      onSelectRef.current?.(selectedDistinctId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedDistinctId])

  // ── Markers ────────────────────────────────────────────────────────────────

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

  const selectFromMarkerRef = useRef((distinctId: string) => {
    suppressFlyRef.current = true
    onSelectRef.current?.(distinctId)
  })

  // Clusters aren't one visitor, so they report as nothing rather than as somebody.
  const onHoverRef = useRef(onHoverVisitor)
  onHoverRef.current = onHoverVisitor
  useEffect(() => {
    onHoverRef.current?.(hoveredId?.startsWith('cluster:') ? null : hoveredId)
  }, [hoveredId])

  const renderEntry = useCallback(
    (root: Root, entry: MapEntry, selectedId: string | null, highlightedId: string | null) => {
      if (entry.type === 'cluster') {
        root.render(<ClusterView cluster={entry} onZoomTo={zoomToClusterRef.current} />)
        return
      }
      root.render(
        <MarkerView
          marker={entry}
          selected={entry.distinctId === selectedId}
          highlighted={entry.distinctId === highlightedId}
          onSelect={selectFromMarkerRef.current}
        />,
      )
    },
    [],
  )

  // Bring one marker in line with the current selection/highlight. No-op when nothing it draws
  // changed, so it's safe to call over every entry.
  const repaint = useCallback(
    (entry: Entry, selectedId: string | null, highlightedId: string | null) => {
      if (entry.data.type === 'visitor') {
        entry.marker.getElement().style.zIndex = stackFor(entry.data.distinctId, selectedId, highlightedId)
      }
      const signature = entrySignature(entry.data, selectedId, highlightedId)
      if (signature === entry.signature) return
      entry.signature = signature
      renderEntry(entry.root, entry.data, selectedId, highlightedId)
    },
    [renderEntry],
  )

  // Repaint only the two markers whose halo changes, not the whole reconcile.
  const highlightRef = useRef(highlightedDistinctId)
  useEffect(() => {
    const previous = highlightRef.current
    highlightRef.current = highlightedDistinctId
    for (const id of [previous, highlightedDistinctId]) {
      const entry = id ? entriesRef.current.get(id) : undefined
      if (entry) repaint(entry, selectedRef.current, highlightedDistinctId)
    }
  }, [highlightedDistinctId, repaint])

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
      place()
      if (selectedRef.current) return
      map.fitBounds(INITIAL_VIEW_BOUNDS, { padding: paddingRef.current, animate: false })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ready, mapRef, containerRef, place])

  // Fly to the selected visitor.
  useEffect(() => {
    selectedRef.current = selectedDistinctId
    const suppressed = suppressFlyRef.current
    suppressFlyRef.current = false
    const map = mapRef.current
    if (!map || !ready) return

    // Repaints the halo too — `entries` doesn't change on selection, so the reconcile below won't run.
    for (const entry of entriesRef.current.values()) repaint(entry, selectedDistinctId, highlightRef.current)

    if (!selectedDistinctId) {
      flownToRef.current = null
      return
    }

    // Fly once per selection. This effect also re-runs on every poll (visitorIndex is rebuilt each
    // time), and re-centring the viewport on the pinned visitor every 10s isn't following them —
    // it's fighting whoever is trying to look somewhere else.
    if (flownToRef.current === selectedDistinctId) return
    const target = visitorIndex.get(selectedDistinctId)
    if (!target) return
    flownToRef.current = selectedDistinctId
    if (suppressed) return

    map.flyTo({
      center: [target.lng, target.lat],
      // Past the declustering zoom so the selected face is revealed, never inside a count badge.
      zoom: Math.max(map.getZoom(), DECLUSTER_ZOOM + 0.5),
      padding: paddingRef.current,
      duration: 700,
      essential: true,
    })
  }, [selectedDistinctId, ready, mapRef, visitorIndex, repaint])

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
      const existing = live.get(id)

      if (existing) {
        existing.data = data
        existing.marker.setLngLat(displayPos(data, cell))
        repaint(existing, selectedRef.current, highlightRef.current)
        continue
      }

      const el = document.createElement('div')
      el.className = 'live-visitor-marker'
      el.dataset.entryId = id
      el.style.opacity = '0'
      el.style.transition = `opacity ${FADE_MS}ms ease`
      el.addEventListener('mouseenter', onMarkerEnter)
      el.addEventListener('mouseleave', onMarkerLeave)
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(displayPos(data, cell))
        .addTo(map)
      // Empty signature so the first repaint always renders.
      const entry: Entry = { marker, root: createRoot(el), data, signature: '' }
      repaint(entry, selectedRef.current, highlightRef.current)
      requestAnimationFrame(() => {
        el.style.opacity = '1'
      })
      live.set(id, entry)
    }

    for (const [id, entry] of live) {
      if (nextIds.has(id)) continue
      live.delete(id)
      const el = entry.marker.getElement()
      el.style.opacity = '0'
      // Held in exitingRef so teardown can still unmount an entry mid-fade.
      const timer = window.setTimeout(() => {
        exitingRef.current.delete(timer)
        entry.root.unmount()
        entry.marker.remove()
      }, FADE_MS)
      exitingRef.current.set(timer, entry)
    }
  }, [entries, ready, mapRef, repaint, onMarkerEnter, onMarkerLeave])

  // As the user zooms: reposition faces so the fan's on-screen gap tracks cellPxForZoom (tighter at the
  // overview zoom, wider as you zoom in; collapses onto the coordinate when zoomed out), and flip
  // declustering when crossing DECLUSTER_ZOOM.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    // `zoom` fires every frame of a wheel-zoom and every frame of the 700ms flyTo/fitBounds
    // animations, and each reposition is O(markers) of layout-affecting setLngLat writes. Coalesce
    // to one run per frame via rAF, and skip entirely when the scatter cell is unchanged — notably
    // it's a constant 0 below the ramp floor, so panning/zooming at the world-overview zoom is free.
    let frame = 0
    let lastCell = Number.NaN
    const reposition = () => {
      frame = 0
      const cell = scatterCellDeg(map.getZoom())
      if (cell === lastCell) return
      lastCell = cell
      for (const entry of entriesRef.current.values()) {
        if (entry.data.type === 'visitor') entry.marker.setLngLat(displayPos(entry.data, cell))
      }
    }

    const onZoom = () => {
      if (!frame) frame = requestAnimationFrame(reposition)
      // Declustering stays responsive at the threshold; the state guard makes it a no-op otherwise.
      // Hysteresis (decluster at ≥6, recluster only below 5.5) stops zoom jitter right at the
      // boundary from repeatedly tearing down and rebuilding every marker's React root.
      setDeclustered(prev => {
        const zoom = map.getZoom()
        const next = prev ? zoom >= DECLUSTER_ZOOM - 0.5 : zoom >= DECLUSTER_ZOOM
        return next === prev ? prev : next
      })
    }

    onZoom()
    map.on('zoom', onZoom)
    return () => {
      map.off('zoom', onZoom)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ready, mapRef])

  // Final teardown.
  useEffect(() => {
    const live = entriesRef.current
    const exiting = exitingRef.current
    return () => {
      for (const [timer, entry] of exiting) {
        window.clearTimeout(timer)
        entry.root.unmount()
        entry.marker.remove()
      }
      exiting.clear()
      for (const entry of live.values()) {
        entry.root.unmount()
        entry.marker.remove()
      }
      live.clear()
    }
  }, [])

  return (
    <div className="absolute inset-0 z-0 h-full w-full">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {rendered && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            ref={popoverRef}
            data-live-popover
            onMouseEnter={holdHover}
            onMouseLeave={() => setHover(null)}
            className="pointer-events-auto absolute top-0 left-0"
          >
            {/* Separate elements: a WAAPI transform outranks inline style, so one element can't both
                track the marker and scale. */}
            <div ref={surfaceRef} className="relative">
              <span
                ref={arrowRef}
                className="absolute size-2.5 rotate-45 rounded-[2px] bg-popover ring-1 ring-border/40"
              />
              <div ref={bodyRef} className={POPOVER_SURFACE}>
                {rendered.type === 'cluster' ? (
                  <ClusterPopover cluster={rendered} />
                ) : (
                  <VisitorPopover
                    marker={rendered}
                    journey={journey}
                    profileHref={profileHref}
                    left={!visitorIndex.has(rendered.distinctId)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LiveVisitorMap
