// Single source of truth for the map-asset versions the app consumes. The assets (basemap PMTiles,
// glyph fonts, India-POV boundary data) are built and deployed by the pug-maps repo (../maps) to R2
// behind the Cloudflare CDN; these pins say which deployed version the app requests, and each must
// be bumped together with its counterpart in that repo's src/config.ts. Paths are versioned so the
// CDN caches them immutably.
//
// Two pins, not one, because they move independently: the POV data changes for reasons the basemap
// date cannot express (a different claim source, a different choropleth scale, a generator fix), and
// pov/* is served with a one-year immutable edge+browser TTL. Shipping a POV fix under an unchanged
// path would leave every returning browser on the old data until the TTL expired.
const BASEMAP_BUILD_DATE = '20260608'
const POV_DATA_VERSION = 2

const POV_DIR = `pov/${BASEMAP_BUILD_DATE}-${POV_DATA_VERSION}`

export const BASEMAP_FILENAME = `basemap-${BASEMAP_BUILD_DATE}.pmtiles`
export const POV_COUNTRIES_PATCH_PATH = `${POV_DIR}/countries-patch.json`
// The boundary overlay ships as two files because the halves carry different licences: the claim
// lines are public-domain/CC0 (Natural Earth, LSIB), the disputed segments are re-extracted from
// the OSM-derived tiles and so are ODbL. Rendered identically; kept apart so redistribution of the
// permissive half is not blocked by share-alike.
export const POV_CLAIM_LINES_PATH = `${POV_DIR}/claim-lines.json`
export const POV_DISPUTED_LINES_PATH = `${POV_DIR}/disputed-lines.json`
