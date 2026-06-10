# India Point-of-View Map Rendering

Both maps in the dashboard render national boundaries per India's official point of view:
Jammu & Kashmir — including Pakistan-administered Kashmir (Azad Kashmir + Gilgit-Baltistan),
the Shaksgam valley, and Aksai Chin — is shown as part of India. This matches how
[openstreetmap.in](https://www.openstreetmap.in/) corrects the same OpenStreetMap data, and is a
legal requirement for maps published for the Indian market.

The corrections are applied at render time in this app. The data that drives them (and the
basemap tiles + fonts) is built by the **pug-maps repo (`../maps`)** and served from the
map-assets origin — R2 behind the Cloudflare CDN in production (`VITE_MAP_ASSETS_URL`), or this
app's own `public/` in local dev (populate it with `bun run sync:app` in `../maps`). See that
repo's README for the data derivation, hosting setup, and the basemap bump procedure.

## Version pin

`src/lib/map-assets.ts` pins `BASEMAP_BUILD_DATE` and derives every asset path from it
(`basemap-<date>.pmtiles`, `pov/<date>/...`). Paths are versioned so the CDN caches them
immutably; the pin must match what pug-maps has deployed, and the two repos' pins are bumped
together.

## The two maps

| Map | Component | Correction |
| --- | --- | --- |
| Live visitors map (`/live`) | `src/components/live-map/visitor-map.tsx` | Style-level: hide disputed lines, overlay POV boundary lines |
| Activity choropleth (overview + dashboards) | `src/components/activity-heatmap-map.tsx` | Geometry swap for India/Pakistan/China |

### Live map: boundary style transforms

The OSM-derived Protomaps tiles flag boundary segments OSM marks as disputed with
`disputed: true`. `src/lib/live-map/basemap.ts` applies two transforms on top of the stock
protomaps theme:

1. **Hide every disputed segment** — both boundary layers get an extra
   `['!=', 'disputed', true]` filter. This removes the Line of Control and the Line of Actual
   Control (correct), but also long stretches Indian maps must draw (Jammu working boundary,
   McMahon line, middle sector) and disputes elsewhere in the world — which is why step 2
   exists.
2. **Overlay the POV line set** — `pov/<date>/boundary-lines.json` is added as a GeoJSON source
   by URL (MapLibre fetches it), drawn with the exact paint of the theme's `boundaries_country`
   layer (cloned per light/dark theme). The line set contains India's claimed Kashmir boundary
   plus every disputed segment that should still be drawn, re-extracted from the tiles so the
   lines reconnect exactly. Derivation details: pug-maps README.

Net effect — hidden: Line of Control, LAC around Aksai Chin, the 1963 Pakistan–China boundary.
Drawn: everything else, plus India's claimed outer boundary.

If the overlay file fails to load, the map degrades to no overlay (the non-fatal map error
handler in `visitor-map.tsx` logs it); the disputed lines stay hidden either way.

### Choropleth: geometry patch

`src/lib/world-countries.ts` builds the country FeatureCollection from world-atlas 110m and
swaps in the India-POV geometries for India (M49 `356`), Pakistan (`586`), and China (`156`)
fetched from `pov/<date>/countries-patch.json` — so the fill, outline, and hover hit-testing all
follow the POV shapes (hovering Gilgit or Aksai Chin reports India). The fetch is async
(`loadWorldCountries()`); `activity-heatmap-map.tsx` adds the source/layers once it resolves.
On fetch failure it falls back to the unpatched de-facto shapes with a console warning — a
degraded map beats no map.

## Known trade-offs

- Disputed **region-level** (state/province) lines are hidden globally, not just in Kashmir.
  Inside J&K that is intentional (no internal LoC-shaped state line); elsewhere the loss is a
  handful of faint admin-1 lines.
- OSM **place labels** are untouched: "Azad Kashmir" / "Gilgit-Baltistan" still appear as region
  labels at higher zooms. Boundaries, not labels, are what the depiction rules govern.
- The western J&K claim line (Natural Earth, ~10m scale) can sit a few km from the OSM
  admin-4 region lines visible underneath at the basemap's top zoom (z8).
- The choropleth patch stitches 10m POV geometry into 110m shapes at the Kashmir bbox edge; the
  resolution seam is sub-pixel at the sizes the choropleth renders.
