import type { Theme } from 'protomaps-themes-base'

import { cssColorToRgb } from '@/lib/maplibre'

// Light mode uses protomaps' stock theme untouched. Only dark is overridden: its ocean sat at the
// same lightness as the app's header bar, so the map had no top edge and read as a hole in the
// chrome rather than a surface. Since shadows don't register on dark, elevation there is carried by
// fill — the same reason card and popover sit above the canvas — so the map is lifted to match.
// Everything is re-based on the app's ladder (hue 265 for neutrals, ink on the muted/faint tiers)
// with the vegetation hues kept, at low chroma so they don't compete with the visitor markers.

// Authored in oklch to match src/index.css; resolved to rgb below since MapLibre parses neither
// oklch nor var().
const DARK = {
  background: 'oklch(0.235 0.018 235)',
  earth: 'oklch(0.285 0.008 265)',
  water: 'oklch(0.235 0.018 235)',

  glacier: 'oklch(0.302 0.006 265)',
  sand: 'oklch(0.290 0.010 95)',
  beach: 'oklch(0.290 0.011 95)',
  park_a: 'oklch(0.293 0.016 150)',
  park_b: 'oklch(0.300 0.022 152)',
  wood_a: 'oklch(0.295 0.018 152)',
  wood_b: 'oklch(0.302 0.024 152)',
  scrub_a: 'oklch(0.293 0.013 145)',
  scrub_b: 'oklch(0.298 0.017 145)',
  zoo: 'oklch(0.294 0.014 150)',
  military: 'oklch(0.294 0.008 265)',
  hospital: 'oklch(0.294 0.007 25)',
  industrial: 'oklch(0.297 0.007 60)',
  school: 'oklch(0.294 0.008 60)',
  pedestrian: 'oklch(0.294 0.008 265)',
  aerodrome: 'oklch(0.297 0.008 265)',
  runway: 'oklch(0.320 0.008 265)',
  pier: 'oklch(0.294 0.009 265)',
  buildings: 'oklch(0.315 0.009 265)',
  landcover: {
    grassland: 'oklch(0.293 0.015 148)',
    barren: 'oklch(0.291 0.010 92)',
    urban_area: 'oklch(0.305 0.009 265)',
    farmland: 'oklch(0.294 0.014 140)',
    glacier: 'oklch(0.302 0.006 265)',
    scrub: 'oklch(0.292 0.011 120)',
    forest: 'oklch(0.298 0.021 155)',
  },

  // Roads keep the cartographic figure/ground (lighter fill, darker casing) at low contrast.
  other: 'oklch(0.328 0.009 265)',
  minor_service: 'oklch(0.325 0.009 265)',
  minor_a: 'oklch(0.331 0.009 265)',
  minor_b: 'oklch(0.338 0.009 265)',
  link: 'oklch(0.348 0.009 265)',
  major: 'oklch(0.358 0.010 265)',
  highway: 'oklch(0.371 0.010 265)',
  minor_service_casing: 'oklch(0.266 0.008 265)',
  minor_casing: 'oklch(0.266 0.008 265)',
  link_casing: 'oklch(0.266 0.008 265)',
  major_casing_early: 'oklch(0.263 0.008 265)',
  major_casing_late: 'oklch(0.263 0.008 265)',
  highway_casing_early: 'oklch(0.260 0.008 265)',
  highway_casing_late: 'oklch(0.260 0.008 265)',
  railway: 'oklch(0.352 0.009 265)',
  boundaries: 'oklch(0.430 0.013 265)',

  tunnel_other_casing: 'oklch(0.268 0.008 265)',
  tunnel_minor_casing: 'oklch(0.268 0.008 265)',
  tunnel_link_casing: 'oklch(0.268 0.008 265)',
  tunnel_major_casing: 'oklch(0.268 0.008 265)',
  tunnel_highway_casing: 'oklch(0.268 0.008 265)',
  tunnel_other: 'oklch(0.310 0.009 265)',
  tunnel_minor: 'oklch(0.310 0.009 265)',
  tunnel_link: 'oklch(0.318 0.009 265)',
  tunnel_major: 'oklch(0.328 0.009 265)',
  tunnel_highway: 'oklch(0.338 0.009 265)',
  bridges_other_casing: 'oklch(0.265 0.008 265)',
  bridges_minor_casing: 'oklch(0.265 0.008 265)',
  bridges_link_casing: 'oklch(0.265 0.008 265)',
  bridges_major_casing: 'oklch(0.263 0.008 265)',
  bridges_highway_casing: 'oklch(0.260 0.008 265)',
  bridges_other: 'oklch(0.331 0.009 265)',
  bridges_minor: 'oklch(0.331 0.009 265)',
  bridges_link: 'oklch(0.348 0.009 265)',
  bridges_major: 'oklch(0.358 0.010 265)',
  bridges_highway: 'oklch(0.371 0.010 265)',

  // Labels ride the ink ramp: places on muted, everything else on faint. Halos are the plane behind.
  city_label: 'oklch(0.720 0.006 265)',
  city_label_halo: 'oklch(0.285 0.008 265)',
  subplace_label: 'oklch(0.575 0.007 265)',
  subplace_label_halo: 'oklch(0.285 0.008 265)',
  state_label: 'oklch(0.545 0.007 265)',
  state_label_halo: 'oklch(0.285 0.008 265)',
  country_label: 'oklch(0.600 0.008 265)',
  ocean_label: 'oklch(0.520 0.007 265)',
  waterway_label: 'oklch(0.545 0.007 265)',
  peak_label: 'oklch(0.565 0.006 265)',
  roads_label_minor: 'oklch(0.525 0.006 265)',
  roads_label_minor_halo: 'oklch(0.285 0.008 265)',
  roads_label_major: 'oklch(0.610 0.007 265)',
  roads_label_major_halo: 'oklch(0.285 0.008 265)',
  address_label: 'oklch(0.555 0.006 265)',
  address_label_halo: 'oklch(0.285 0.008 265)',
} satisfies Partial<Theme>

// Resolution touches a canvas, so it can't run at module scope — resolve once, on first use.
let resolved: Partial<Theme> | null = null

const resolveDark = () => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(DARK)) {
    if (typeof value === 'string') out[key] = cssColorToRgb(value)
    else out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cssColorToRgb(v)]))
  }
  return out as Partial<Theme>
}

/** Dark-mode overrides for the protomaps theme; light passes through untouched. */
export const basemapPalette = (dark: boolean) => {
  if (!dark) return {}
  if (!resolved) resolved = resolveDark()
  return resolved
}
