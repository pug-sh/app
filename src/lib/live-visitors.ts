import type { JsonObject } from '@bufbuild/protobuf'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { structGet } from '@/lib/struct'

export { formatCountryName } from '@/lib/location'

export const LIVE_POLL_MS = 10_000
export const LIVE_PAGE_SIZE = 1000

// Selectable "live now" windows. The default (5m) matches the prior hard-coded behaviour.
export const LIVE_WINDOW_OPTIONS = [
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 5 * 60_000 },
  { label: '15m', ms: 15 * 60_000 },
  { label: '30m', ms: 30 * 60_000 },
] as const

export const LIVE_WINDOW_MS = LIVE_WINDOW_OPTIONS[1].ms

export type CountryCount = {
  country: string
  count: number
}

export type DeviceBreakdown = {
  desktop: number
  mobile: number
}

export type KindCount = {
  name: string
  count: number
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

export const liveTimeRange = (windowMs = LIVE_WINDOW_MS, now = new Date()) => ({
  from: new Date(now.getTime() - windowMs),
  to: now,
})

// ── Event-aware helpers ──────────────────────────────────────────────────────
// The live feed is no longer page-views only; a visitor's row is headlined by
// their latest event of any kind. These helpers turn an event into display text
// and roll the live set up into the dimensions the filter bar offers.

const firstProp = (obj: JsonObject | undefined, keys: string[]) => {
  for (const key of keys) {
    const value = structGet(obj, key)
    if (value) return value
  }
  return undefined
}

const AMOUNT_KEYS = ['amount', 'value', 'revenue', 'total', 'price', 'order_value']
const SEARCH_KEYS = ['query', 'q', 'term', 'search_term', 'keyword']
const NAME_KEYS = ['name', 'title', 'product_name', 'product', 'label', 'plan', 'plan_name']
const CURRENCY_KEYS = ['currency', '$currency', 'currency_code']

/** Latest-event headline: the most useful secondary text for a given event kind. */
export const describeEvent = (event: ActivityEvent): { kind: string; detail: string } => {
  const kind = event.kind || 'event'
  const custom = event.customProperties
  const path = formatPagePathOrEmpty(structGet(event.autoProperties, '$url'))

  if (kind === 'page_view' || kind === 'screen_view') return { kind, detail: path }

  const search = firstProp(custom, SEARCH_KEYS)
  if (search) return { kind, detail: `“${search}”` }

  const amount = firstProp(custom, AMOUNT_KEYS)
  if (amount) {
    const currency = firstProp(custom, CURRENCY_KEYS)
    return { kind, detail: currency ? `${currency} ${amount}` : amount }
  }

  const name = firstProp(custom, NAME_KEYS)
  if (name) return { kind, detail: name }

  return { kind, detail: path }
}

const formatPagePathOrEmpty = (url: string | undefined) => (url ? formatPagePath(url) : '')

/** All events for each visitor, preserving the caller's occur_time DESC order (newest first). */
export const groupEventsByVisitor = (events: ActivityEvent[]): Map<string, ActivityEvent[]> => {
  const map = new Map<string, ActivityEvent[]>()
  for (const event of events) {
    const existing = map.get(event.distinctId)
    if (existing) existing.push(event)
    else map.set(event.distinctId, [event])
  }
  return map
}

/** Count visitors by their latest event kind — populates the event-kind filter dropdown. */
export const latestKindCounts = (visitors: ActivityEvent[]): KindCount[] => {
  const counts = new Map<string, number>()
  for (const visitor of visitors) {
    const kind = visitor.kind || 'event'
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Best-effort visitor-local clock, when the SDK enriched a `$timezone`. */
export const visitorLocalTime = (auto: JsonObject | undefined, date: Date | null): string | null => {
  const tz = structGet(auto, '$timezone')
  if (!tz || !date) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(
      date,
    )
  } catch {
    return null
  }
}
