import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { COUNTRY_CENTROIDS } from '@/components/country-centroids'
import {
  countKinds,
  describeEvent,
  type EventIdentity,
  eventAvatarUrl,
  eventIdentity,
  formatPagePath,
  isMobileVisitor,
  type KindCount,
  referrerDomain,
} from '@/components/live-map/live-visitors'
import { resolveRegionCentroid } from '@/components/region-centroids'
import { structGet } from '@/lib/struct'
import { tsToDate } from '@/lib/timestamp'

export type VisitorMapMarker = {
  distinctId: string
  // Who they are, resolved off the event's traits — the popover shows this instead of the raw id.
  identity: EventIdentity
  iso: string
  region?: string
  city?: string
  page: string
  kind: string
  // Headline for the latest event, same as the panel row's — see describeEvent.
  detail: string
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  device: string
  referrer?: string
  utmSource?: string
  timezone?: string
  lastSeen?: Date
  avatarUrl?: string
  // lat/lng is the visitor's resolved point (GeoIP coords, else region/country centroid); offset is
  // the scatter the map scales down by zoom so coincident faces hold a constant pixel separation and
  // converge on the point as you zoom in.
  lat: number
  lng: number
  offsetLat: number
  offsetLng: number
}

// A cluster collapses a crowded country/region group into one count badge while zoomed out; zooming
// past the map's decluster threshold breaks it back into individual faces.
export type ClusterMapMarker = {
  groupKey: string
  iso: string
  region?: string
  city?: string
  count: number
  topKind: string
  // Full kind mix, count-descending — the badge paints itself with the leader, the popover lists it.
  kinds: KindCount[]
  lat: number
  lng: number
}

export type MapEntry = ({ type: 'visitor' } & VisitorMapMarker) | ({ type: 'cluster' } & ClusterMapMarker)

// Visitors who share a point (everyone in a city gets the same GeoIP coords) are fanned out with a
// sunflower layout: even ~1-cell spacing between neighbours at any count, with no random collisions.
// Offsets are in abstract "cells" — the map converts a cell to degrees per zoom so the on-screen gap
// stays constant. The whole group is rotated by a hash so different places don't all face the same way.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const seedHash = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  return Math.abs(hash)
}

const sunflowerOffset = (i: number, n: number, seed: string): [number, number] => {
  if (n <= 1) return [0, 0]
  const rot = ((seedHash(seed) & 0xffff) / 0xffff) * 2 * Math.PI
  const r = Math.sqrt(i + 0.5)
  const theta = i * GOLDEN_ANGLE + rot
  // 0.8 squishes latitude so the fan reads as a circle on the Mercator projection.
  return [Math.cos(theta) * r, Math.sin(theta) * r * 0.8]
}

type Placed = {
  event: ActivityEvent
  lng: number
  lat: number
  exact: boolean
}

type VisitorGroup = {
  key: string
  iso: string
  region?: string
  members: Placed[]
}

// Resolve a visitor to a real point: exact GeoIP coordinates when present, else the region
// centroid, else the country centroid. (0,0) is GeoIP's "unknown" sentinel — treat it as absent.
const placeVisitor = (event: ActivityEvent, iso: string, region: string | undefined): Placed | null => {
  const auto = event.autoProperties
  const lat = Number.parseFloat(structGet(auto, '$latitude') ?? '')
  const lng = Number.parseFloat(structGet(auto, '$longitude') ?? '')
  const hasCoords =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    (lat !== 0 || lng !== 0)
  if (hasCoords) return { event, lng, lat, exact: true }

  const centroid = (region ? resolveRegionCentroid(iso, region) : null) ?? COUNTRY_CENTROIDS[iso]
  if (!centroid) return null
  return { event, lng: centroid[0], lat: centroid[1], exact: false }
}

// Cluster by city (then region, then country) so faces in the same place collapse together.
const groupKeyFor = (iso: string, region: string | undefined, city: string | undefined) => {
  if (city) return `${iso}|${(region ?? '').toUpperCase()}|${city.toUpperCase()}`
  if (region) return `${iso}|${region.toUpperCase()}`
  return iso
}

// Resolve and group visitors into places. This is the expensive pass (GeoIP/centroid resolution
// per visitor); callers run it once per data change and feed the result to both projections below.
export const buildGroups = (visitors: ActivityEvent[]): VisitorGroup[] => {
  const groups = new Map<string, VisitorGroup>()

  for (const v of visitors) {
    const country = structGet(v.autoProperties, '$country')
    if (!country) continue
    const iso = country.toUpperCase()
    const region = structGet(v.autoProperties, '$region')?.trim() || undefined
    const city = structGet(v.autoProperties, '$city')?.trim() || undefined

    const placed = placeVisitor(v, iso, region)
    if (!placed) continue

    const key = groupKeyFor(iso, region, city)
    const existing = groups.get(key)
    if (existing) existing.members.push(placed)
    else groups.set(key, { key, iso, region, members: [placed] })
  }

  return [...groups.values()]
}

const centroidOf = (members: Placed[]): [number, number] => {
  let lng = 0
  let lat = 0
  for (const m of members) {
    lng += m.lng
    lat += m.lat
  }
  return [lng / members.length, lat / members.length]
}

const visitorMarker = (placed: Placed, group: VisitorGroup, index: number): VisitorMapMarker => {
  const v = placed.event
  const auto = v.autoProperties
  const { kind, detail } = describeEvent(v)
  // Fan out faces that share a point; a solo visitor stays exactly where they are.
  const [dLng, dLat] = sunflowerOffset(index, group.members.length, group.key)
  return {
    distinctId: v.distinctId,
    identity: eventIdentity(v),
    iso: group.iso,
    region: group.region,
    city: structGet(auto, '$city'),
    page: formatPagePath(structGet(auto, '$url')),
    kind,
    detail,
    browser: structGet(auto, '$browser'),
    browserVersion: structGet(auto, '$browserVersion'),
    os: structGet(auto, '$os'),
    osVersion: structGet(auto, '$osVersion'),
    device: structGet(auto, '$device') || (isMobileVisitor(auto) ? 'Mobile' : 'Desktop'),
    referrer: referrerDomain(auto),
    utmSource: structGet(auto, '$utmSource'),
    timezone: structGet(auto, '$timezone'),
    lastSeen: tsToDate(v.occurTime) ?? undefined,
    avatarUrl: eventAvatarUrl(v),
    lng: placed.lng,
    lat: placed.lat,
    offsetLng: dLng,
    offsetLat: dLat,
  }
}

// Where every visitor sits, clustered or not — the map flies to any of them by distinctId, including
// one currently collapsed inside a cluster badge. Points only: building whole markers here would
// duplicate the per-visitor projection `groupsToEntries` already does.
export const groupsToPoints = (groups: VisitorGroup[]) => {
  const points = new Map<string, { lng: number; lat: number }>()
  for (const group of groups) {
    for (const m of group.members) points.set(m.event.distinctId, { lng: m.lng, lat: m.lat })
  }
  return points
}

// Cluster crowded groups into a single badge; groups at/under the threshold (or explicitly
// expanded) render their individual faces. Returns a mixed list the map renders directly.
export const groupsToEntries = (groups: VisitorGroup[], { threshold = 6 }: { threshold?: number } = {}): MapEntry[] => {
  const entries: MapEntry[] = []

  for (const group of groups) {
    const clustered = group.members.length > threshold
    if (clustered) {
      const [lng, lat] = centroidOf(group.members)
      const kinds = countKinds(group.members.map(m => m.event))
      entries.push({
        type: 'cluster',
        groupKey: group.key,
        iso: group.iso,
        region: group.region,
        city: structGet(group.members[0].event.autoProperties, '$city'),
        count: group.members.length,
        topKind: kinds[0]?.name ?? 'event',
        kinds,
        lng,
        lat,
      })
      continue
    }

    group.members.forEach((m, i) => entries.push({ type: 'visitor', ...visitorMarker(m, group, i) }))
  }

  return entries
}
