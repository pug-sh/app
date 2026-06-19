import type { JsonObject } from '@bufbuild/protobuf'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { structGet } from '@/lib/struct'

export { formatCountryName } from '@/lib/location'

export const LIVE_WINDOW_MS = 5 * 60 * 1000
export const LIVE_POLL_MS = 10_000
export const LIVE_PAGE_SIZE = 1000
export type CountryCount = {
  country: string
  count: number
}

export type DeviceBreakdown = {
  desktop: number
  mobile: number
}

/** Keep the first event per distinct_id (caller must pass occur_time DESC order). */
export const dedupeVisitors = (events: ActivityEvent[]): ActivityEvent[] => {
  const seen = new Set<string>()
  const out: ActivityEvent[] = []
  for (const event of events) {
    if (seen.has(event.distinctId)) continue
    seen.add(event.distinctId)
    out.push(event)
  }
  return out
}

export const countryBreakdown = (visitors: ActivityEvent[]): CountryCount[] => {
  const counts = new Map<string, number>()
  for (const visitor of visitors) {
    const country = structGet(visitor.autoProperties, '$country')
    if (!country) continue
    counts.set(country, (counts.get(country) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
}

export const deviceBreakdown = (visitors: ActivityEvent[]): DeviceBreakdown => {
  let mobile = 0
  let desktop = 0
  for (const visitor of visitors) {
    if (structGet(visitor.autoProperties, '$mobile') === 'true') mobile++
    else desktop++
  }
  return { desktop, mobile }
}

export const formatPagePath = (url: string | undefined): string => {
  if (!url) return '—'
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const pathname = new URL(url).pathname
      return pathname || '/'
    } catch {
      return url
    }
  }
  return url
}

export const isMobileVisitor = (auto: JsonObject | undefined): boolean => structGet(auto, '$mobile') === 'true'

export const liveTimeRange = (now = new Date()) => ({
  from: new Date(now.getTime() - LIVE_WINDOW_MS),
  to: now,
})
