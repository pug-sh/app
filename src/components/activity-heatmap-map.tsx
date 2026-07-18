import type { FeatureCollection, Geometry } from 'geojson'
import type { ExpressionSpecification, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMaplibreMap, useResolvedDark } from '@/hooks/use-maplibre-map'
import { COUNTRIES_VIEW_BOUNDS, resolveThemeColors } from '@/lib/maplibre'
import { ALPHA2_TO_M49, loadWorldCountries } from '@/lib/world-countries'

type Props = {
  countries: { iso: string; count: number }[]
  // When set, clicking a country that has data invokes this with its alpha-2 ISO (e.g. "IN").
  onCountrySelect?: (alpha2: string) => void
  // Alpha-2 ISO codes to highlight as selected (a bold accent outline). Empty/undefined = none.
  selected?: readonly string[]
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

// Selected countries get a bold accent outline; everything else the faint neutral border.
const lineColorExpr = (primary: string, border: string): ExpressionSpecification => [
  'case',
  ['boolean', ['feature-state', 'selected'], false],
  primary,
  border,
]

const ActivityHeatmapMap = ({ countries, onCountrySelect, selected }: Props) => {
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

  // Alpha-2 codes currently selected (uppercased to match `counts`), painted as a highlight ring.
  const selectedSet = useMemo(() => new Set((selected ?? []).map(iso => iso.toUpperCase())), [selected])

  // Latest select callback, read by the bound (once) click handler.
  const onSelectRef = useRef(onCountrySelect)
  onSelectRef.current = onCountrySelect

  // Country shapes resolve asynchronously (the India-POV patch is fetched from the map-assets
  // origin); source and layers are added once they land.
  const [worldCountries, setWorldCountries] = useState<FeatureCollection<Geometry> | null>(null)
  useEffect(() => {
    let active = true
    loadWorldCountries().then(fc => {
      if (active) setWorldCountries(fc)
    })
    return () => {
      active = false
    }
  }, [])

  // One-time: source, layers, and hover handlers (added once the map and the shapes are ready).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !worldCountries) return

    const { primary, mutedForeground, border } = resolveThemeColors()
    map.addSource(SOURCE, { type: 'geojson', data: worldCountries })
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
      paint: {
        'line-color': lineColorExpr(primary, border),
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0.5],
        'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0.35],
      },
    })

    const onMove = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      const alpha2 = feature?.properties?.alpha2 as string | undefined
      const count = alpha2 ? countsRef.current.get(alpha2) : undefined
      if (count === undefined) {
        setTooltip(null)
        map.getCanvas().style.cursor = ''
        return
      }
      const name = (feature?.properties?.name as string | undefined) ?? alpha2 ?? ''
      setTooltip({ name, count, x: e.point.x, y: e.point.y })
      // Pointer only over countries with data, and only when a selection handler is wired.
      map.getCanvas().style.cursor = onSelectRef.current ? 'pointer' : ''
    }
    const onLeave = () => {
      setTooltip(null)
      map.getCanvas().style.cursor = ''
    }
    // Cross-filter on click — data countries only, so clicking blank ocean/no-data land is a no-op.
    const onClick = (e: MapLayerMouseEvent) => {
      const alpha2 = e.features?.[0]?.properties?.alpha2 as string | undefined
      if (alpha2 && countsRef.current.has(alpha2)) onSelectRef.current?.(alpha2)
    }
    map.on('mousemove', FILL_LAYER, onMove)
    map.on('mouseleave', FILL_LAYER, onLeave)
    map.on('click', FILL_LAYER, onClick)

    return () => {
      map.off('mousemove', FILL_LAYER, onMove)
      map.off('mouseleave', FILL_LAYER, onLeave)
      map.off('click', FILL_LAYER, onClick)
    }
  }, [ready, mapRef, worldCountries])

  // Data + selection feature state — repaint on any counts/selection change. removeFeatureState clears
  // everything (including `selected`), so both are re-applied together in one pass.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getSource(SOURCE)) return

    map.removeFeatureState({ source: SOURCE })
    if (counts.size === 0 && selectedSet.size === 0) return

    const values = [...counts.values()]
    const min = Math.min(...values)
    const max = Math.max(...values)
    // A selected country may carry no data in the current window (e.g. restored from the URL), so paint
    // the union: data countries get their intensity, selected countries get the highlight ring.
    for (const iso of new Set([...counts.keys(), ...selectedSet])) {
      const id = ALPHA2_TO_M49[iso]
      if (id === undefined) continue
      const count = counts.get(iso)
      map.setFeatureState(
        { source: SOURCE, id },
        count === undefined
          ? { selected: true }
          : { hasData: true, opacity: opacityForValue(count, min, max), selected: selectedSet.has(iso) },
      )
    }
  }, [counts, selectedSet, ready, mapRef, worldCountries])

  // Theme swap — re-resolve token colors into the paint properties (opacities are data-driven).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer(FILL_LAYER)) return
    const { primary, mutedForeground, border } = resolveThemeColors()
    map.setPaintProperty(FILL_LAYER, 'fill-color', fillColorExpr(primary, mutedForeground))
    map.setPaintProperty(LINE_LAYER, 'line-color', lineColorExpr(primary, border))
  }, [dark, ready, mapRef, worldCountries])

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
