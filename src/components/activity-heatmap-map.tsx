import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAtomValue } from 'jotai'
import { type CSSProperties, useCallback, useEffect, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MapContainer, useMap } from 'react-leaflet'
import worldCountries from '@/assets/world-countries.json'
import { type Theme, themeAtom } from '@/data/theme.atoms'
import { formatCountryName } from '@/lib/live-visitors'

export type CountryActivity = {
  iso: string
  count: number
}

type Props = {
  countries: CountryActivity[]
}

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const CARTO_DARK_FILTER = 'brightness(1.55) contrast(0.82) saturate(0.85)'

const WORLD_BOUNDS = L.latLngBounds([-85, -180], [85, 180])
const INITIAL_VIEW_BOUNDS = L.latLngBounds([-55, -180], [75, 180])

const HEAT_FILL = {
  light: 'rgb(5, 150, 105)',
  dark: 'rgb(52, 211, 153)',
}

const NO_DATA_FILL = {
  light: 'rgb(226, 232, 240)',
  dark: 'rgb(38, 38, 38)',
}

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

const intensity = (count: number, max: number) => {
  if (max <= 0 || count <= 0) return 0
  return Math.sqrt(count / max)
}

type CountryFeature = {
  id?: string | number
  properties?: { iso?: string; name?: string } | null
}

const featureIso = (feature: CountryFeature) => {
  const id = feature.id
  if (typeof id === 'string' && id.length === 2) return id.toUpperCase()
  const iso = feature.properties?.iso
  return iso?.toUpperCase() ?? ''
}

const countryStyle = (_iso: string, count: number, max: number, dark: boolean, hovered = false): L.PathOptions => {
  const stroke = dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)'
  const weight = hovered ? 1.1 : 0.55

  if (count <= 0) {
    return {
      fillColor: dark ? NO_DATA_FILL.dark : NO_DATA_FILL.light,
      fillOpacity: dark ? 0.35 : 0.55,
      color: stroke,
      weight,
    }
  }

  const fill = dark ? HEAT_FILL.dark : HEAT_FILL.light
  const t = intensity(count, max)

  return {
    fillColor: fill,
    fillOpacity: hovered ? Math.min(0.98, 0.2 + t * 0.88) : 0.12 + t * 0.82,
    color: stroke,
    weight,
  }
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

const MapLayout = () => {
  const map = useMap()

  const fit = useCallback(() => {
    map.invalidateSize({ pan: false })
    map.fitBounds(INITIAL_VIEW_BOUNDS, { padding: [0, 0], animate: false })
  }, [map])

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

const CountryTooltip = ({ iso, count }: { iso: string; count: number }) => (
  <div className="text-xs">
    <div className="font-semibold text-foreground">{formatCountryName(iso)}</div>
    <div className="mt-0.5 text-muted-foreground">{count.toLocaleString()} events</div>
  </div>
)

const CountryChoroplethLayer = ({ countries, dark }: { countries: CountryActivity[]; dark: boolean }) => {
  const map = useMap()

  useEffect(() => {
    const countMap = new Map(countries.map(item => [item.iso, item.count]))
    const max = countries.reduce((peak, item) => Math.max(peak, item.count), 0)
    const popupRoots: Root[] = []

    const layer = L.geoJSON(worldCountries as GeoJSON.GeoJsonObject, {
      style: feature => {
        if (!feature) return countryStyle('', 0, max, dark)
        const iso = featureIso(feature)
        const count = countMap.get(iso) ?? 0
        return countryStyle(iso, count, max, dark)
      },
      onEachFeature: (feature, pathLayer) => {
        const iso = featureIso(feature)
        const count = countMap.get(iso) ?? 0
        const path = pathLayer as L.Path

        if (count > 0) {
          path.getElement()?.classList.add('activity-heatmap-country')
          const popupEl = document.createElement('div')
          const root = createRoot(popupEl)
          root.render(<CountryTooltip iso={iso} count={count} />)
          popupRoots.push(root)
          path.bindPopup(popupEl, {
            closeButton: false,
            className: 'activity-heatmap-popup',
            autoPan: false,
          })
        }

        path.on('mouseover', () => {
          path.setStyle(countryStyle(iso, count, max, dark, true))
          path.bringToFront()
          if (count > 0) path.openPopup()
        })
        path.on('mouseout', () => {
          path.setStyle(countryStyle(iso, count, max, dark))
          path.closePopup()
        })
      },
    })

    layer.addTo(map)

    return () => {
      for (const root of popupRoots) root.unmount()
      layer.remove()
    }
  }, [countries, dark, map])

  return null
}

const HeatLegend = ({ countries, dark }: { countries: CountryActivity[]; dark: boolean }) => {
  const max = countries.reduce((peak, item) => Math.max(peak, item.count), 0)
  if (max <= 0) return null

  const fill = dark ? HEAT_FILL.dark : HEAT_FILL.light

  return (
    <div className="pointer-events-none absolute bottom-2 right-2 z-[500] rounded-md border border-border/60 bg-background/90 px-2.5 py-2 shadow-sm backdrop-blur-sm">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Events</div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] tabular-nums text-muted-foreground">Low</span>
        <div
          className="h-2 w-24 rounded-full"
          style={{
            background: `linear-gradient(to right, color-mix(in oklab, ${fill} 20%, transparent), ${fill})`,
          }}
        />
        <span className="text-[10px] tabular-nums text-muted-foreground">{max.toLocaleString()}</span>
      </div>
    </div>
  )
}

const ActivityHeatmapMap = ({ countries }: Props) => {
  const dark = useResolvedDark()
  const mapStyle = {
    '--live-map-tile-filter': dark ? CARTO_DARK_FILTER : 'none',
  } as CSSProperties

  return (
    <div className="relative h-full min-h-0 activity-heatmap-map">
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
        <MapLayout />
        <CountryChoroplethLayer countries={countries} dark={dark} />
      </MapContainer>
      <HeatLegend countries={countries} dark={dark} />
    </div>
  )
}

export default ActivityHeatmapMap
