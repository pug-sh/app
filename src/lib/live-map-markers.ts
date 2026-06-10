import { stringHash } from 'facehash'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { COUNTRY_CENTROIDS } from '@/components/country-centroids'
import { resolveRegionCentroid } from '@/components/region-centroids'
import { formatPagePath, isMobileVisitor } from '@/lib/live-visitors'
import { structGet } from '@/lib/struct'

export const LIVE_AVATAR_COLORS = [
  '#f43f5e',
  '#fb923c',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

export type VisitorMapMarker = {
  distinctId: string
  groupKey: string
  iso: string
  region?: string
  city?: string
  page: string
  kind: string
  browser?: string
  device: string
  lat: number
  lng: number
}

// A cluster collapses a crowded country/region group into one badge until it's expanded.
export type ClusterMapMarker = {
  groupKey: string
  iso: string
  region?: string
  count: number
  topKind: string
  lat: number
  lng: number
}

export type MapEntry = ({ type: 'visitor' } & VisitorMapMarker) | ({ type: 'cluster' } & ClusterMapMarker)

// Scatter radius (degrees) around a group's centroid. Deliberately small — crowded groups
// collapse into a cluster badge, so the scatter only needs to fan out a handful of faces.
// Large radii used to fling markers into neighbouring countries or the sea. Bigger countries
// (inland centroids) tolerate a little more; coastal/small ones stay tight.
const COUNTRY_SPREAD_DEG: Record<string, number> = {
  RU: 4,
  CA: 3.5,
  US: 3,
  AU: 3,
  BR: 3,
  CN: 3,
  KZ: 3,
  AR: 2.5,
  DZ: 2.5,
  ID: 2.5,
  IN: 2.5,
  MN: 2.5,
  MX: 2.5,
  IR: 2,
  LY: 2,
  SA: 2,
  EG: 1.8,
}

const REGION_SPREAD_DEG: Record<string, number> = {
  CA: 2,
  AU: 2,
  US: 1.5,
  BR: 1.5,
  IN: 1.2,
  MX: 1.2,
  GB: 0.8,
  DE: 0.8,
}

const spreadFor = (iso: string, hasRegion: boolean) => {
  return (hasRegion ? REGION_SPREAD_DEG[iso] : COUNTRY_SPREAD_DEG[iso]) ?? (hasRegion ? 0.8 : 2.5)
}

const scatterLatLng = (distinctId: string, groupKey: string, spread: number): [number, number] => {
  const h = stringHash(`${distinctId}:${groupKey}`)
  const angle = ((h & 0xffff) / 0xffff) * 2 * Math.PI
  // Linear (not sqrt) radius biases points toward the centroid, keeping faces near their
  // country/region rather than pushed out to the edge of the disc.
  const r = ((h >>> 16) & 0xffff) / 0xffff
  return [Math.cos(angle) * r * spread, Math.sin(angle) * r * spread * 0.7]
}

type VisitorGroup = {
  key: string
  iso: string
  region?: string
  visitors: ActivityEvent[]
  baseLng: number
  baseLat: number
}

const buildGroups = (visitors: ActivityEvent[]): VisitorGroup[] => {
  const groups = new Map<string, VisitorGroup>()

  for (const v of visitors) {
    const country = structGet(v.autoProperties, '$country')
    if (!country) continue
    const iso = country.toUpperCase()
    const regionRaw = structGet(v.autoProperties, '$region')
    const region = regionRaw?.trim() || undefined
    const regionCentroid = region ? resolveRegionCentroid(iso, region) : null
    const countryCentroid = COUNTRY_CENTROIDS[iso]
    if (!regionCentroid && !countryCentroid) continue

    const key = region ? `${iso}|${region.toUpperCase()}` : iso
    const existing = groups.get(key)
    if (existing) {
      existing.visitors.push(v)
      continue
    }

    const [baseLng, baseLat] = regionCentroid ?? countryCentroid!
    groups.set(key, { key, iso, region, visitors: [v], baseLng, baseLat })
  }

  return [...groups.values()]
}

const visitorMarker = (v: ActivityEvent, group: VisitorGroup, spread: number): VisitorMapMarker => {
  const auto = v.autoProperties
  // A lone visitor sits exactly on the centroid — scatter only exists to separate overlapping
  // faces, so jittering a solo marker just pushes it off its (best-known) location for no reason.
  const [dLng, dLat] = group.visitors.length > 1 ? scatterLatLng(v.distinctId, group.key, spread) : [0, 0]
  return {
    distinctId: v.distinctId,
    groupKey: group.key,
    iso: group.iso,
    region: group.region,
    city: structGet(auto, '$city'),
    page: formatPagePath(structGet(auto, '$url')),
    kind: v.kind || 'event',
    browser: structGet(auto, '$browser'),
    device: structGet(auto, '$device') || (isMobileVisitor(auto) ? 'Mobile' : 'Desktop'),
    lng: group.baseLng + dLng,
    lat: group.baseLat + dLat,
  }
}

const topKind = (visitors: ActivityEvent[]): string => {
  const counts = new Map<string, number>()
  for (const v of visitors) {
    const kind = v.kind || 'event'
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  let best = 'event'
  let bestCount = -1
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      best = kind
      bestCount = count
    }
  }
  return best
}

// Flat visitor markers (no clustering) — kept for callers that always want individual faces.
export const buildVisitorMapMarkers = (visitors: ActivityEvent[]): VisitorMapMarker[] =>
  buildGroups(visitors).flatMap(group => {
    const spread = spreadFor(group.iso, Boolean(group.region))
    return group.visitors.map(v => visitorMarker(v, group, spread))
  })

// Cluster crowded groups into a single badge; groups at/under the threshold (or explicitly
// expanded) render their individual faces. Returns a mixed list the map renders directly.
export const buildMapEntries = (
  visitors: ActivityEvent[],
  { threshold = 6, expanded }: { threshold?: number; expanded?: ReadonlySet<string> } = {},
): MapEntry[] => {
  const entries: MapEntry[] = []

  for (const group of buildGroups(visitors)) {
    const clustered = group.visitors.length > threshold && !expanded?.has(group.key)
    if (clustered) {
      entries.push({
        type: 'cluster',
        groupKey: group.key,
        iso: group.iso,
        region: group.region,
        count: group.visitors.length,
        topKind: topKind(group.visitors),
        lng: group.baseLng,
        lat: group.baseLat,
      })
      continue
    }

    const spread = spreadFor(group.iso, Boolean(group.region))
    for (const v of group.visitors) entries.push({ type: 'visitor', ...visitorMarker(v, group, spread) })
  }

  return entries
}
