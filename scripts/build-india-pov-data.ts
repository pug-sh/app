#!/usr/bin/env bun
//
// Generates the India point-of-view (POV) geo data committed under src/lib/data/:
//
//   - india-pov-countries-patch.json   Replacement geometries for India (356), Pakistan (586)
//                                      and China (156) used by the activity choropleth. Within
//                                      the Kashmir region the world-atlas 110m shapes are swapped
//                                      for Natural Earth's official India-POV outlines, so
//                                      Pakistan-administered Kashmir (Azad Kashmir +
//                                      Gilgit-Baltistan) and Aksai Chin render as India.
//   - india-pov-boundary-lines.json    MultiLineString overlaid on the OSM live map, which hides
//                                      every `disputed`-flagged boundary segment. Contains:
//                                        1. India's claimed Kashmir lines that have no de-facto
//                                           boundary at all (from Natural Earth's India POV).
//                                        2. The disputed-flagged OSM segments that official
//                                           Indian maps DO draw — the Jammu working boundary,
//                                           the middle sector, the McMahon line, Kalapani, and
//                                           every disputed line outside the India zone (Crimea,
//                                           Western Sahara, ...) — re-extracted verbatim from the
//                                           tiles so they reconnect exactly with visible borders.
//                                      What stays hidden: the Line of Control, the LAC around
//                                      Aksai Chin, and the 1963 Pakistan-China line.
//
// Sources:
//   - Natural Earth 10m admin_0_countries        (de-facto worldview; fetched, cached in /tmp)
//   - Natural Earth 10m admin_0_countries_ind    (official India worldview; fetched)
//   - world-atlas countries-110m                 (choropleth base, from node_modules)
//   - public/basemap.pmtiles                     (run `bun run fetch:map-assets` first)
//
// Usage: bun run generate:pov-data
// The outputs are committed; re-run only when bumping Natural Earth data or the basemap.
// Full pipeline documentation: docs/india-pov-maps.md

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { VectorTile } from '@mapbox/vector-tile'
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
import Pbf from 'pbf'
import { PMTiles } from 'pmtiles'
import polygonClipping from 'polygon-clipping'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'

type Ring = Position[]
type Poly = Ring[]
type MultiPoly = Poly[]

const OUT_DIR = join(import.meta.dir, '..', 'src', 'lib', 'data')
const CACHE = '/tmp/ne'
const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'

// Kashmir sector — the only region where the worldviews differ that we patch. Covers Azad
// Kashmir, Gilgit-Baltistan, Aksai Chin and the Shaksgam valley; excludes other minor disputes.
const KASHMIR_BBOX: Poly = [
  [
    [72.0, 32.2],
    [80.6, 32.2],
    [80.6, 37.3],
    [72.0, 37.3],
    [72.0, 32.2],
  ],
]

// M49 numeric ids used by the choropleth join (world-atlas feature ids).
const COUNTRIES = [
  { name: 'India', m49: '356' },
  { name: 'Pakistan', m49: '586' },
  { name: 'China', m49: '156' },
]

const fetchNe = async (name: string) => {
  mkdirSync(CACHE, { recursive: true })
  const path = join(CACHE, `${name}.geojson`)
  if (!existsSync(path)) {
    console.log(`Fetching ${name}...`)
    const res = await fetch(`${NE_BASE}/${name}.geojson`)
    if (!res.ok) throw new Error(`failed to fetch ${name}: ${res.status}`)
    writeFileSync(path, await res.text())
  }
  return JSON.parse(readFileSync(path, 'utf8')) as FeatureCollection
}

const asMultiPoly = (geom: Polygon | MultiPolygon): MultiPoly =>
  geom.type === 'Polygon' ? [geom.coordinates as Poly] : (geom.coordinates as MultiPoly)

const findCountry = (fc: FeatureCollection, name: string) => {
  const f = fc.features.find(f => (f.properties as Record<string, unknown>)?.ADMIN === name)
  if (!f) throw new Error(`country not found: ${name}`)
  return asMultiPoly(f.geometry as Polygon | MultiPolygon)
}

// --- Douglas-Peucker simplification (planar, fine for this latitude band) ---

const perpDist = (p: Position, a: Position, b: Position) => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  const cx = a[0] + Math.max(0, Math.min(1, t)) * dx
  const cy = a[1] + Math.max(0, Math.min(1, t)) * dy
  return Math.hypot(p[0] - cx, p[1] - cy)
}

const simplifyRing = (ring: Ring, tolerance: number): Ring => {
  if (ring.length <= 4) return ring
  const keep = new Array(ring.length).fill(false)
  keep[0] = keep[ring.length - 1] = true
  const stack: [number, number][] = [[0, ring.length - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop() as [number, number]
    let maxD = 0
    let maxI = -1
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(ring[i], ring[lo], ring[hi])
      if (d > maxD) {
        maxD = d
        maxI = i
      }
    }
    if (maxD > tolerance) {
      keep[maxI] = true
      stack.push([lo, maxI], [maxI, hi])
    }
  }
  const out = ring.filter((_, i) => keep[i])
  return out.length >= 4 ? out : ring
}

const simplify = (mp: MultiPoly, tolerance: number): MultiPoly =>
  mp
    .map(poly => poly.map(ring => simplifyRing(ring, tolerance)).filter(ring => ring.length >= 4))
    .filter(poly => poly.length > 0)

const round = (mp: MultiPoly): MultiPoly =>
  mp.map(poly => poly.map(ring => ring.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4])))

const area = (mp: MultiPoly) => {
  let sum = 0
  for (const poly of mp)
    for (const ring of poly) {
      let s = 0
      for (let i = 1; i < ring.length; i++) s += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]
      sum += s / 2
    }
  return Math.abs(sum)
}

// --- Choropleth patch: swap the Kashmir window of the 110m shapes for the 10m POV outlines ---

const buildCountriesPatch = (pov: FeatureCollection, topo110: Topology) => {
  const collection = feature(topo110, topo110.objects.countries) as FeatureCollection
  const patch: Record<string, MultiPolygon> = {}

  for (const { name, m49 } of COUNTRIES) {
    const base = asMultiPoly(
      (collection.features.find(f => String(f.id).padStart(3, '0') === m49) as { geometry: Polygon | MultiPolygon })
        .geometry,
    )
    const povShape = findCountry(pov, name)

    const outside = polygonClipping.difference(base, [KASHMIR_BBOX])
    const window = simplify(polygonClipping.intersection(povShape, [KASHMIR_BBOX]), 0.02)
    const merged = polygonClipping.union(outside, window)

    patch[m49] = { type: 'MultiPolygon', coordinates: round(merged) }
    const delta = ((area(merged) - area(base)) / area(base)) * 100
    console.log(`${name}: ${base.length} -> ${merged.length} polys, area ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`)
  }
  return patch
}

// --- Claim lines: POV India boundary segments that are not de-facto international boundaries ---

const segKey = (a: Position, b: Position) => {
  const ka = `${a[0].toFixed(6)},${a[1].toFixed(6)}`
  const kb = `${b[0].toFixed(6)},${b[1].toFixed(6)}`
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

const inKashmir = (p: Position) => p[0] >= 72.0 && p[0] <= 80.6 && p[1] >= 32.2 && p[1] <= 37.3

const buildClaimLines = (pov: FeatureCollection, fact: FeatureCollection) => {
  // Every segment that already exists on some de-facto country ring is drawn by the basemap.
  const factSegs = new Set<string>()
  for (const f of fact.features) {
    for (const poly of asMultiPoly(f.geometry as Polygon | MultiPolygon))
      for (const ring of poly)
        for (let i = 1; i < ring.length; i++) {
          if (inKashmir(ring[i - 1]) || inKashmir(ring[i])) factSegs.add(segKey(ring[i - 1], ring[i]))
        }
  }

  const lines: Position[][] = []
  for (const poly of findCountry(pov, 'India')) {
    for (const ring of poly) {
      let run: Position[] = []
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]
        const b = ring[i]
        const claimOnly = (inKashmir(a) || inKashmir(b)) && !factSegs.has(segKey(a, b))
        if (claimOnly) {
          if (run.length === 0) run.push(a)
          run.push(b)
        } else if (run.length > 1) {
          lines.push(run)
          run = []
        } else {
          run = []
        }
      }
      if (run.length > 1) lines.push(run)
    }
  }

  console.log(`Claim lines: ${lines.length} segments, ${lines.flat().length} points`)
  return lines
}

// --- Disputed OSM segments that should still be drawn ---
//
// The live-map style hides every boundary segment the tiles flag `disputed`. In the India zone
// that correctly removes the LoC / LAC / 1963 Pakistan-China line, but OSM also flags long
// stretches of boundary that official Indian maps draw as plain international borders (Jammu
// working boundary, middle sector, McMahon line, Kalapani). And outside the India zone hiding is
// not wanted at all. So: extract every disputed country-level line from the tiles, and keep it
// unless it sits in the India zone without coinciding with a boundary India recognises — the POV
// India outline or any de-facto ring other than India/Pakistan/China (exactly the three rings
// that carry the LoC, LAC and 1963 line).

const INDIA_ZONE: [number, number, number, number] = [60, 5, 100, 40] // lon/lat bounds
const EPS_DEG = 0.04 // ~4.4km — NE 10m vs OSM divergence along a shared boundary stays well under this

const inZone = (p: Position) =>
  p[0] >= INDIA_ZONE[0] && p[0] <= INDIA_ZONE[2] && p[1] >= INDIA_ZONE[1] && p[1] <= INDIA_ZONE[3]

// Spatial grid over reference segments for fast point-to-boundary distance tests.
const buildRefIndex = (pov: FeatureCollection, fact: FeatureCollection) => {
  const cell = 0.2
  const grid = new Map<string, [Position, Position][]>()
  const addRing = (ring: Position[]) => {
    for (let i = 1; i < ring.length; i++) {
      const [a, b] = [ring[i - 1], ring[i]]
      if (!inZone(a) && !inZone(b)) continue
      const minX = Math.floor(Math.min(a[0], b[0]) / cell)
      const maxX = Math.floor(Math.max(a[0], b[0]) / cell)
      const minY = Math.floor(Math.min(a[1], b[1]) / cell)
      const maxY = Math.floor(Math.max(a[1], b[1]) / cell)
      for (let x = minX; x <= maxX; x++)
        for (let y = minY; y <= maxY; y++) {
          const key = `${x},${y}`
          let list = grid.get(key)
          if (!list) grid.set(key, (list = []))
          list.push([a, b])
        }
    }
  }
  const addCountry = (mp: MultiPoly) => {
    for (const poly of mp) for (const ring of poly) addRing(ring)
  }

  addCountry(findCountry(pov, 'India'))
  for (const f of fact.features) {
    const admin = (f.properties as Record<string, unknown>).ADMIN
    if (admin === 'India' || admin === 'Pakistan' || admin === 'China') continue
    addCountry(asMultiPoly(f.geometry as Polygon | MultiPolygon))
  }

  const segDist = (p: Position, [a, b]: [Position, Position]) => {
    const kx = Math.cos((p[1] * Math.PI) / 180) // shrink lon so distances are roughly isotropic
    const scaled: Position = [p[0] * kx, p[1]]
    return perpDist(scaled, [a[0] * kx, a[1]], [b[0] * kx, b[1]])
  }

  return (p: Position) => {
    const cx = Math.floor(p[0] / cell)
    const cy = Math.floor(p[1] / cell)
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (const seg of grid.get(`${x},${y}`) ?? []) {
          if (segDist(p, seg) < EPS_DEG) return true
        }
      }
    return false
  }
}

const SWEEP_ZOOM = 5
const EXTRACT_ZOOM = 7

const loadDisputedLines = async (onRecognisedBoundary: (p: Position) => boolean) => {
  const path = join(import.meta.dir, '..', 'public', 'basemap.pmtiles')
  if (!existsSync(path)) {
    console.error('error: public/basemap.pmtiles missing — run `bun run fetch:map-assets` first.')
    process.exit(1)
  }
  const buf = readFileSync(path)
  const pm = new PMTiles({
    getKey: () => 'local',
    getBytes: async (offset: number, length: number) => ({ data: buf.buffer.slice(offset, offset + length) }),
  })

  const disputedLines = async (z: number, x: number, y: number) => {
    const t = await pm.getZxy(z, x, y)
    if (!t) return []
    const layer = new VectorTile(new Pbf(new Uint8Array(t.data))).layers['boundaries']
    if (!layer) return []
    const lines: Position[][] = []
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i)
      if (f.properties.kind !== 'country' || f.properties.disputed !== true) continue
      const geom = f.toGeoJSON(x, y, z).geometry
      if (geom.type === 'LineString') lines.push(geom.coordinates)
      if (geom.type === 'MultiLineString') lines.push(...geom.coordinates)
    }
    return lines
  }

  // Sweep the world at low zoom to find tiles containing disputed lines, then re-extract those
  // areas at a zoom fine enough for the basemap's max display zoom.
  const hits: [number, number][] = []
  const n = 2 ** SWEEP_ZOOM
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++) {
      if ((await disputedLines(SWEEP_ZOOM, x, y)).length > 0) hits.push([x, y])
    }

  const step = 2 ** (EXTRACT_ZOOM - SWEEP_ZOOM)
  const lines: Position[][] = []
  for (const [sx, sy] of hits)
    for (let dx = 0; dx < step; dx++)
      for (let dy = 0; dy < step; dy++) {
        lines.push(...(await disputedLines(EXTRACT_ZOOM, sx * step + dx, sy * step + dy)))
      }

  // Keep runs of segments that are outside the India zone or coincide with a recognised boundary.
  const kept: Position[][] = []
  for (const line of lines) {
    let run: Position[] = []
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]]
      const zoned = inZone(a) || inZone(b)
      const keep = !zoned || (onRecognisedBoundary(a) && onRecognisedBoundary(b))
      if (keep) {
        if (run.length === 0) run.push(a)
        run.push(b)
      } else {
        if (run.length > 1) kept.push(run)
        run = []
      }
    }
    if (run.length > 1) kept.push(run)
  }
  console.log(`Disputed lines: ${lines.length} raw, ${kept.length} kept after classification`)
  return kept.map(line => simplifyRing(line, 0.005))
}

// --- Main ---

const [pov, fact] = await Promise.all([fetchNe('ne_10m_admin_0_countries_ind'), fetchNe('ne_10m_admin_0_countries')])
const topo110 = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'node_modules', 'world-atlas', 'countries-110m.json'), 'utf8'),
) as Topology

mkdirSync(OUT_DIR, { recursive: true })

const patch = buildCountriesPatch(pov, topo110)
const patchPath = join(OUT_DIR, 'india-pov-countries-patch.json')
writeFileSync(patchPath, JSON.stringify(patch))
console.log(`Wrote ${patchPath} (${(JSON.stringify(patch).length / 1024).toFixed(0)}KB)`)

const claimLines = buildClaimLines(pov, fact)
const disputedKept = await loadDisputedLines(buildRefIndex(pov, fact))
const allLines = [...claimLines, ...disputedKept].map(line =>
  line.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]),
)
const overlay = { type: 'MultiLineString', coordinates: allLines }
const linesPath = join(OUT_DIR, 'india-pov-boundary-lines.json')
writeFileSync(linesPath, JSON.stringify(overlay))
console.log(`Wrote ${linesPath} (${(JSON.stringify(overlay).length / 1024).toFixed(0)}KB, ${allLines.length} lines)`)
