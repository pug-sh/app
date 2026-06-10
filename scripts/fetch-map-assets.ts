#!/usr/bin/env bun
//
// Fetches the self-hosted MapLibre map assets into public/:
//   - public/basemap.pmtiles  z0-z8 global extract of the Protomaps daily planet build (~500MB)
//   - public/fonts/           Noto Sans glyph PBFs required by protomaps-themes-base labels
//
// Both are gitignored and fetched on demand instead of committed. In production they are served
// from an object store (Cloudflare R2) via VITE_MAP_ASSETS_URL because the basemap is too large
// for our static host; this script populates them locally for dev and gives you the exact files
// to upload to that bucket.
//
// Usage:    bun run fetch:map-assets
// Re-fetch: delete public/basemap.pmtiles and/or public/fonts, then run again.
// Overrides:
//   PROTOMAPS_BUILD_DATE=YYYYMMDD   pin a different Protomaps daily build for the basemap
//   PROTOMAPS_ASSETS_REF=<ref>      pin a different protomaps/basemaps-assets ref for the fonts

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'bun'

const PUBLIC = join(import.meta.dir, '..', 'public')

// Pinned to the build the committed map was developed against (OSM replication 2026-06-08).
const BUILD_DATE = process.env.PROTOMAPS_BUILD_DATE ?? '20260608'
const MAXZOOM = 8
const FONTS_REF = process.env.PROTOMAPS_ASSETS_REF ?? 'main'

const fetchBasemap = async () => {
  const dest = join(PUBLIC, 'basemap.pmtiles')
  if (existsSync(dest)) {
    console.log(`Basemap already present: ${dest}. Delete it to re-fetch.`)
    return
  }

  if (!Bun.which('pmtiles')) {
    console.error("error: the 'pmtiles' CLI (go-pmtiles) is required but not installed.")
    console.error('Install it, then re-run `bun run fetch:map-assets`:')
    console.error('  macOS:  brew install pmtiles')
    console.error('  other:  https://github.com/protomaps/go-pmtiles/releases')
    process.exit(1)
  }

  // `pmtiles extract` pulls only the low-zoom tiles over HTTP range requests — it does NOT
  // download the full ~120GB planet.
  const source = `https://build.protomaps.com/${BUILD_DATE}.pmtiles`
  console.log(`Extracting z0-${MAXZOOM} basemap from ${source}`)
  console.log('(HTTP range requests — only low-zoom tiles are downloaded, not the full planet)')
  await $`pmtiles extract ${source} ${dest} --maxzoom=${MAXZOOM}`
  console.log(`Done: ${dest}`)
}

const fetchFonts = async () => {
  const dest = join(PUBLIC, 'fonts')
  if (existsSync(dest)) {
    console.log(`Glyph fonts already present: ${dest}. Delete it to re-fetch.`)
    return
  }

  // protomaps-themes-base labels reference the Noto Sans stacks shipped by protomaps/basemaps-assets.
  const tarball = `https://github.com/protomaps/basemaps-assets/archive/refs/heads/${FONTS_REF}.tar.gz`
  console.log(`Fetching glyph fonts from protomaps/basemaps-assets (${FONTS_REF})`)

  const res = await fetch(tarball)
  if (!res.ok) {
    console.error(`error: failed to download fonts (${res.status} ${res.statusText}) from ${tarball}`)
    process.exit(1)
  }

  const tmp = await mkdtemp(join(tmpdir(), 'pug-map-fonts-'))
  try {
    const archive = join(tmp, 'assets.tar.gz')
    await Bun.write(archive, res)
    await mkdir(dest, { recursive: true })
    // Extract only the fonts/ subtree, stripping the `basemaps-assets-<ref>/fonts/` prefix so the
    // font-stack directories land directly under public/fonts. (Avoids a cross-device move out of /tmp.)
    await $`tar -xzf ${archive} --strip-components=2 -C ${dest} basemaps-assets-${FONTS_REF}/fonts`
    console.log(`Done: ${dest}`)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

await fetchBasemap()
await fetchFonts()
