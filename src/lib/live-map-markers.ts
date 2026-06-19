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
  iso: string
  region?: string
  city?: string
  page: string
  browser?: string
  device: string
  lat: number
  lng: number
}

const COUNTRY_SPREAD_DEG: Record<string, number> = {
  AR: 12,
  AU: 20,
  BR: 14,
  CA: 22,
  CN: 16,
  DZ: 10,
  EG: 6,
  ID: 12,
  IN: 10,
  IR: 8,
  KZ: 14,
  LY: 8,
  MX: 10,
  MN: 8,
  RU: 25,
  SA: 10,
  US: 18,
}

const REGION_SPREAD_DEG: Record<string, number> = {
  US: 4,
  CA: 8,
  AU: 8,
  GB: 3,
  DE: 3,
  IN: 4,
  BR: 5,
  MX: 4,
}

const spreadFor = (iso: string, hasRegion: boolean) => {
  const base = (hasRegion ? REGION_SPREAD_DEG[iso] : COUNTRY_SPREAD_DEG[iso]) ?? (hasRegion ? 3 : 5)
  return base
}

const scatterLatLng = (distinctId: string, groupKey: string, spread: number): [number, number] => {
  const h = stringHash(`${distinctId}:${groupKey}`)
  const angle = ((h & 0xffff) / 0xffff) * 2 * Math.PI
  const r = Math.sqrt(((h >>> 16) & 0xffff) / 0xffff)
  return [Math.cos(angle) * r * spread, Math.sin(angle) * r * spread * 0.7]
}

type VisitorGroup = {
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

    const groupKey = region ? `${iso}|${region.toUpperCase()}` : iso
    const existing = groups.get(groupKey)
    if (existing) {
      existing.visitors.push(v)
      continue
    }

    const [baseLng, baseLat] = regionCentroid ?? countryCentroid!
    groups.set(groupKey, { iso, region, visitors: [v], baseLng, baseLat })
  }

  return [...groups.values()]
}

export const buildVisitorMapMarkers = (visitors: ActivityEvent[]): VisitorMapMarker[] => {
  const result: VisitorMapMarker[] = []

  for (const group of buildGroups(visitors)) {
    const spread = spreadFor(group.iso, Boolean(group.region))
    const groupKey = group.region ? `${group.iso}:${group.region}` : group.iso
    for (const v of group.visitors) {
      const auto = v.autoProperties
      const [dLng, dLat] = scatterLatLng(v.distinctId, groupKey, spread)
      result.push({
        distinctId: v.distinctId,
        iso: group.iso,
        region: group.region,
        city: structGet(auto, '$city'),
        page: formatPagePath(structGet(auto, '$url')),
        browser: structGet(auto, '$browser'),
        device: structGet(auto, '$device') || (isMobileVisitor(auto) ? 'Mobile' : 'Desktop'),
        lng: group.baseLng + dLng,
        lat: group.baseLat + dLat,
      })
    }
  }

  return result
}
