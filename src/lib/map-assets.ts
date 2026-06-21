// Single source of truth for the map-asset version the app consumes. The assets (basemap
// PMTiles, glyph fonts, India-POV boundary data) are built and deployed by the pug-maps repo
// (../maps) to R2 behind the Cloudflare CDN; this date pins which deployed version the app
// requests and must be bumped together with that repo's src/config.ts. Paths are versioned so
// the CDN caches them immutably.
const BASEMAP_BUILD_DATE = '20260608'
export const BASEMAP_FILENAME = `basemap-${BASEMAP_BUILD_DATE}.pmtiles`
export const POV_COUNTRIES_PATCH_PATH = `pov/${BASEMAP_BUILD_DATE}/countries-patch.json`
export const POV_BOUNDARY_LINES_PATH = `pov/${BASEMAP_BUILD_DATE}/boundary-lines.json`
