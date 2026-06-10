import type { MultiLineString } from 'geojson'
import {
  type ExpressionSpecification,
  type FilterSpecification,
  type LayerSpecification,
  type PaddingOptions,
  type StyleSpecification,
} from 'maplibre-gl'
import themeLayers from 'protomaps-themes-base'

import indiaPovBoundaryLines from '@/lib/data/india-pov-boundary-lines.json'
import { ensurePmtilesProtocol, mapAssetsOrigin } from '@/lib/maplibre'

const BASEMAP_SOURCE = 'protomaps'
const PMTILES_URL = `pmtiles://${mapAssetsOrigin()}/basemap.pmtiles`
const ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'

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

// India point-of-view boundaries. The OSM-derived tiles draw the de-facto lines in Kashmir (the
// Line of Control / Line of Actual Control), which official Indian maps must not show as
// international boundaries. The tiles flag those segments `disputed`, so we drop every disputed
// boundary segment and overlay the precomputed POV line set instead: India's claimed Kashmir
// boundary plus every disputed segment Indian maps do draw (Jammu working boundary, McMahon
// line, disputes outside the India zone, ...) — the same correction openstreetmap.in applies.
// See scripts/build-india-pov-data.ts for how the overlay is derived.
const CLAIM_LINES_SOURCE = 'india-pov-boundaries'

const NOT_DISPUTED: FilterSpecification = ['!=', 'disputed', true]

const hideDisputedBoundaries = (layers: LayerSpecification[]) =>
  layers.map(layer => {
    if (!('source-layer' in layer) || layer['source-layer'] !== 'boundaries') return layer
    const filter = (layer.filter ? ['all', layer.filter, NOT_DISPUTED] : NOT_DISPUTED) as FilterSpecification
    return { ...layer, filter }
  })

// Style the overlay lines exactly like the theme's country boundaries (per light/dark theme) by
// cloning the paint of `boundaries_country`, and slot the overlay right next to it so it sits
// below the same labels.
const overlayClaimLines = (layers: LayerSpecification[]) => {
  const country = layers.find(layer => layer.id === 'boundaries_country')
  const overlay: LayerSpecification = {
    id: 'india-pov-boundary-lines',
    type: 'line',
    source: CLAIM_LINES_SOURCE,
    paint: country?.type === 'line' && country.paint ? { ...country.paint } : { 'line-color': '#adadad' },
  }
  const at = country ? layers.indexOf(country) + 1 : layers.length
  return [...layers.slice(0, at), overlay, ...layers.slice(at)]
}

export const buildBasemapStyle = (dark: boolean): StyleSpecification => ({
  version: 8,
  glyphs: `${mapAssetsOrigin()}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    [BASEMAP_SOURCE]: {
      type: 'vector',
      url: PMTILES_URL,
      attribution: ATTRIBUTION,
    },
    [CLAIM_LINES_SOURCE]: {
      type: 'geojson',
      data: { type: 'Feature', geometry: indiaPovBoundaryLines as MultiLineString, properties: {} },
    },
  },
  layers: overlayClaimLines(
    hideDisputedBoundaries(englishLabels(themeLayers(BASEMAP_SOURCE, dark ? 'dark' : 'light', 'en'))),
  ),
})

export type ViewportPadding = {
  left?: number
  right?: number
  top?: number
  bottom?: number
}

export const resolvePadding = (padding: ViewportPadding | undefined): PaddingOptions => ({
  left: padding?.left ?? 0,
  right: padding?.right ?? 0,
  top: padding?.top ?? 0,
  bottom: padding?.bottom ?? 0,
})
