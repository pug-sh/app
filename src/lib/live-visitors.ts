import type { JsonObject } from '@bufbuild/protobuf'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { structGet } from '@/lib/struct'

export const LIVE_WINDOW_MS = 5 * 60 * 1000
export const LIVE_POLL_MS = 10_000
export const LIVE_PAGE_SIZE = 1000
export const LIVE_LIST_LIMIT = 100

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

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

export const formatCountryName = (code: string | undefined): string => {
  if (!code) return '—'
  if (code.length !== 2) return code
  try {
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
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

/** ISO 3166-1 alpha-2 code → live visitor count. */
export const countryCountsToMap = (countries: CountryCount[]): Map<string, number> =>
  new Map(countries.map(({ country, count }) => [country.toUpperCase(), count]))

export const deviceBreakdown = (visitors: ActivityEvent[]): DeviceBreakdown => {
  let mobile = 0
  let desktop = 0
  for (const visitor of visitors) {
    if (structGet(visitor.autoProperties, '$mobile') === 'true') mobile++
    else desktop++
  }
  return { desktop, mobile }
}

export const formatVisitorLocation = (auto: JsonObject | undefined): string => {
  const city = structGet(auto, '$city')
  const region = structGet(auto, '$region')
  const countryCode = structGet(auto, '$country')
  const country = countryCode ? formatCountryName(countryCode) : undefined
  const parts = [city, region, country].filter(Boolean)
  return parts.join(', ') || '—'
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

export const countryFlag = (code: string) => {
  const upper = code.toUpperCase()
  if (upper.length !== 2) return ''
  return String.fromCodePoint(0x1f1e6 + upper.charCodeAt(0) - 65, 0x1f1e6 + upper.charCodeAt(1) - 65)
}

export const liveTimeRange = (now = new Date()) => ({
  from: new Date(now.getTime() - LIVE_WINDOW_MS),
  to: now,
})
