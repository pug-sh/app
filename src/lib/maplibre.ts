import maplibregl, { type LngLatBoundsLike } from 'maplibre-gl'
import { Protocol } from 'pmtiles'

// Register the pmtiles:// protocol once so MapLibre can read self-hosted .pmtiles archives.
let protocolRegistered = false
export const ensurePmtilesProtocol = () => {
  if (protocolRegistered) return
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
  protocolRegistered = true
}

// Base URL for self-hosted map assets (basemap PMTiles, glyph fonts, POV data), served from an
// object store (Cloudflare R2) behind the Cloudflare CDN — the basemap is ~500MB, too large for
// the static host. Set VITE_MAP_ASSETS_URL in .env; dev and prod both use the CDN. The bucket
// allows CORS from any origin and honours Range requests for the PMTiles.
const ASSETS_BASE = (import.meta.env.VITE_MAP_ASSETS_URL ?? '').trim().replace(/\/+$/, '')

export const mapAssetsOrigin = () => ASSETS_BASE || (typeof window === 'undefined' ? '' : window.location.origin)

// Default framing on load — slightly cropped poles, mirrors the previous Leaflet view.
export const INITIAL_VIEW_BOUNDS: LngLatBoundsLike = [
  [-180, -55],
  [180, 75],
]

// Frame used by the choropleth so all countries are visible.
export const COUNTRIES_VIEW_BOUNDS: LngLatBoundsLike = [
  [-180, -60],
  [180, 85],
]

type ThemeColors = {
  primary: string
  border: string
  mutedForeground: string
}

// MapLibre paint properties accept concrete color strings only — they can't read CSS `var()`,
// and our design tokens are authored as `oklch(...)`. Resolve them to plain rgb() by painting a
// 1×1 canvas and reading the pixel back, which works regardless of MapLibre's color parser.
let conversionCtx: CanvasRenderingContext2D | null = null

const cssColorToRgb = (value: string) => {
  if (!conversionCtx) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    conversionCtx = canvas.getContext('2d', { willReadFrequently: true })
  }
  const ctx = conversionCtx
  if (!ctx) return value
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

const readVar = (styles: CSSStyleDeclaration, name: string) => cssColorToRgb(styles.getPropertyValue(name).trim())

export const resolveThemeColors = (): ThemeColors => {
  const styles = getComputedStyle(document.documentElement)
  return {
    primary: readVar(styles, '--primary'),
    border: readVar(styles, '--border'),
    mutedForeground: readVar(styles, '--muted-foreground'),
  }
}
