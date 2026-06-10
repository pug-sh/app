import {
  type ExpressionSpecification,
  type LayerSpecification,
  type PaddingOptions,
  type StyleSpecification,
} from 'maplibre-gl'
import themeLayers from 'protomaps-themes-base'

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

export const buildBasemapStyle = (dark: boolean): StyleSpecification => ({
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
