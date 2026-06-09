import type { ExpressionSpecification, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMaplibreMap, useResolvedDark } from '@/hooks/use-maplibre-map'
import { COUNTRIES_VIEW_BOUNDS, resolveThemeColors } from '@/lib/maplibre'
import { ALPHA2_TO_M49, WORLD_COUNTRIES } from '@/lib/world-countries'

type Props = {
  countries: { iso: string; count: number }[]
}

const FILL_LAYER = 'countries-fill'
const LINE_LAYER = 'countries-line'
const SOURCE = 'countries'

const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] }

// Match the previous react-svg-worldmap intensity: sqrt-scaled opacity in [0.16, 0.90].
const opacityForValue = (value: number, min: number, max: number) => {
  const range = max - min
  const t = range > 0 ? Math.sqrt((value - min) / range) : 1
  return 0.16 + t * 0.74
}

const fillColorExpr = (primary: string, muted: string): ExpressionSpecification => [
  'case',
  ['boolean', ['feature-state', 'hasData'], false],
  primary,
  muted,
]

const ActivityHeatmapMap = ({ countries }: Props) => {
  const dark = useResolvedDark()
  const [tooltip, setTooltip] = useState<{ name: string; count: number; x: number; y: number } | null>(null)

  // Keep interaction enabled (so layer hover events fire for the tooltip) but disable every
  // navigation handler — the choropleth is a static, non-pannable map like the old SVG.
  const { containerRef, mapRef, ready } = useMaplibreMap({
    style: EMPTY_STYLE,
    bounds: COUNTRIES_VIEW_BOUNDS,
    renderWorldCopies: false,
    attributionControl: false,
    dragPan: false,
    scrollZoom: false,
    boxZoom: false,
    dragRotate: false,
    keyboard: false,
    doubleClickZoom: false,
    touchZoomRotate: false,
  })

  // Latest count-by-alpha2, read by the bound (once) hover handler.
  const countsRef = useRef(new Map<string, number>())
  const counts = useMemo(() => new Map(countries.map(({ iso, count }) => [iso.toUpperCase(), count])), [countries])
  countsRef.current = counts

  // One-time: source, layers, and hover handlers (added on first load).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const { primary, mutedForeground, border } = resolveThemeColors()
    map.addSource(SOURCE, { type: 'geojson', data: WORLD_COUNTRIES })
    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE,
      paint: {
        'fill-color': fillColorExpr(primary, mutedForeground),
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hasData'], false],
          ['coalesce', ['feature-state', 'opacity'], 0.16],
          0.07,
        ],
      },
    })
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE,
      paint: { 'line-color': border, 'line-width': 0.5, 'line-opacity': 0.35 },
    })

    const onMove = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      const alpha2 = feature?.properties?.alpha2 as string | undefined
      const count = alpha2 ? countsRef.current.get(alpha2) : undefined
      if (count === undefined) {
        setTooltip(null)
        return
      }
      const name = (feature?.properties?.name as string | undefined) ?? alpha2 ?? ''
      setTooltip({ name, count, x: e.point.x, y: e.point.y })
    }
    const onLeave = () => setTooltip(null)
    map.on('mousemove', FILL_LAYER, onMove)
    map.on('mouseleave', FILL_LAYER, onLeave)

    return () => {
      map.off('mousemove', FILL_LAYER, onMove)
      map.off('mouseleave', FILL_LAYER, onLeave)
    }
  }, [ready, mapRef])

  // Data-driven feature state — recompute on every countries change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    map.removeFeatureState({ source: SOURCE })
    if (counts.size === 0) return

    const values = [...counts.values()]
    const min = Math.min(...values)
    const max = Math.max(...values)
    for (const [iso, count] of counts) {
      const id = ALPHA2_TO_M49[iso]
      if (id === undefined) continue
      map.setFeatureState({ source: SOURCE, id }, { hasData: true, opacity: opacityForValue(count, min, max) })
    }
  }, [counts, ready, mapRef])

  // Theme swap — re-resolve token colors into the paint properties (opacities are data-driven).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const { primary, mutedForeground, border } = resolveThemeColors()
    map.setPaintProperty(FILL_LAYER, 'fill-color', fillColorExpr(primary, mutedForeground))
    map.setPaintProperty(LINE_LAYER, 'line-color', border)
  }, [dark, ready, mapRef])

  // Keep the canvas sized to the container.
  useEffect(() => {
    const el = containerRef.current
    const map = mapRef.current
    if (!el || !map) return
    const observer = new ResizeObserver(() => {
      map.resize()
      map.fitBounds(COUNTRIES_VIEW_BOUNDS, { animate: false })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef, mapRef])

  return (
    <div ref={containerRef} className="relative h-full min-h-0 w-full overflow-hidden">
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md"
          style={{ left: tooltip.x, top: tooltip.y - 8 }}
        >
          {tooltip.name} {tooltip.count} events
        </div>
      )}
    </div>
  )
}

export default ActivityHeatmapMap
