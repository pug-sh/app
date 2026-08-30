import type { JsonObject } from '@bufbuild/protobuf'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { platformOf } from '@/lib/auto-properties'
import { resolveAvatarUrl } from '@/lib/avatar-traits'
import { resolveTraitEmail, resolveTraitName } from '@/lib/identity-traits'
import { structFirst, structGet } from '@/lib/struct'
import { tsToDate } from '@/lib/timestamp'

/** Stable empty journey — shared so a visitor with no trail doesn't churn memo identities. */
export const EMPTY_JOURNEY: ActivityEvent[] = []

// Only set when a customer sends a picture trait on the event; profile traits aren't on it.
export const eventAvatarUrl = (event: ActivityEvent) =>
  resolveAvatarUrl(event.autoProperties) ?? resolveAvatarUrl(event.customProperties)

/** An email or short handle is the identity; a long anonymous id is noise past its head and tail. */
const shortId = (id: string) => {
  if (id.length <= 16 || id.includes('@')) return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}

export type EventIdentity = {
  /** Best human label: name trait, else email trait, else the distinct id. Never empty. */
  label: string
  /** The label is really an id, so the UI keeps it in font-mono. */
  isFallback: boolean
}

// Pick keeps this tied to the proto while staying trivially constructible in tests.
type IdentitySource = Pick<ActivityEvent, 'distinctId' | 'autoProperties' | 'customProperties'>

// Either bag can carry traits — the same two-bag lookup the avatar does.
export const eventIdentity = (event: IdentitySource): EventIdentity => {
  const trait =
    resolveTraitName(event.autoProperties) ??
    resolveTraitName(event.customProperties) ??
    resolveTraitEmail(event.autoProperties) ??
    resolveTraitEmail(event.customProperties)
  if (trait) return { label: trait, isFallback: false }
  // An identified visitor is often keyed by their own email — that's a name, not an opaque id.
  return { label: shortId(event.distinctId) || 'anonymous', isFallback: !event.distinctId.includes('@') }
}

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

export type VisitorDeviceType = 'mobile' | 'desktop' | 'tv'

// Record, not three named fields: a new device type is then a compile error everywhere the set is
// enumerated — this map, deviceTypeLabel, and the filter bar's segments — rather than a bucket that
// silently counts nothing.
export type DeviceBreakdown = Record<VisitorDeviceType, number>

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
  const counts: DeviceBreakdown = { desktop: 0, mobile: 0, tv: 0 }
  for (const visitor of visitors) counts[resolveDeviceType(visitor.autoProperties)]++
  return counts
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

// Mobile only: the native desktop platforms already land in desktop by fallback, and adding them
// here would claim the bucket for 'server' and 'fuchsia' too, which name no device class.
const MOBILE_PLATFORMS = new Set(['android', 'ios'])

// Three rungs, because no single key covers the family. $deviceType is the Flutter SDK's own answer
// and the only TV signal anywhere in the stack (Android leanback). $platform catches the React Native
// SDK, which sends no $deviceType at all. $mobile is last and web-only — navigator.userAgentData, or
// the backend's UA parse, which on a native app reads the HTTP client and always says false, so
// reaching it from a native event is what put every Flutter and RN phone in desktop.
export const resolveDeviceType = (auto: JsonObject | undefined): VisitorDeviceType => {
  const declared = structGet(auto, '$deviceType')?.trim().toLowerCase()
  if (declared === 'mobile' || declared === 'desktop' || declared === 'tv') return declared
  if (MOBILE_PLATFORMS.has(platformOf(auto)?.trim().toLowerCase() ?? '')) return 'mobile'
  return structGet(auto, '$mobile') === 'true' ? 'mobile' : 'desktop'
}

export const deviceTypeLabel: Record<VisitorDeviceType, string> = {
  mobile: 'Mobile',
  desktop: 'Desktop',
  tv: 'TV',
}

export const liveTimeRange = (windowMs = LIVE_WINDOW_MS, now = new Date()) => ({
  from: new Date(now.getTime() - windowMs),
  to: now,
})

// ── Event-aware helpers ──────────────────────────────────────────────────────
// The live feed is no longer page-views only; a visitor's row is headlined by
// their latest event of any kind. These helpers turn an event into display text
// and roll the live set up into the dimensions the filter bar offers.

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

  const search = structFirst(custom, SEARCH_KEYS)
  if (search) return { kind, detail: `“${search}”` }

  const amount = structFirst(custom, AMOUNT_KEYS)
  if (amount) {
    const currency = structFirst(custom, CURRENCY_KEYS)
    return { kind, detail: currency ? `${currency} ${amount}` : amount }
  }

  const name = structFirst(custom, NAME_KEYS)
  if (name) return { kind, detail: name }

  return { kind, detail: path }
}

const formatPagePathOrEmpty = (url: string | undefined) => (url ? formatPagePath(url) : '')

/**
 * Kind mix, count-descending then name-ascending — the one tie-break the filter bar and the map's
 * cluster popover share. Over deduped visitors this counts people by current activity; over raw
 * events it counts events.
 */
export const countKinds = (events: Iterable<ActivityEvent>): KindCount[] => {
  const counts = new Map<string, number>()
  for (const event of events) {
    const kind = event.kind || 'event'
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Coarse duration — these read at a glance in a column, not to the second. */
const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export type SessionStat = {
  count: number
  firstSeen?: Date
  lastSeen?: Date
}

/** Per-visitor event count and span, in one pass — the panel needs this for every row at once. */
export const sessionStats = (events: ActivityEvent[]) => {
  const stats = new Map<string, SessionStat>()
  for (const event of events) {
    const at = tsToDate(event.occurTime) ?? undefined
    const seen = stats.get(event.distinctId)
    if (!seen) {
      stats.set(event.distinctId, { count: 1, firstSeen: at, lastSeen: at })
      continue
    }
    seen.count++
    if (!at) continue
    if (!seen.firstSeen || at < seen.firstSeen) seen.firstSeen = at
    if (!seen.lastSeen || at > seen.lastSeen) seen.lastSeen = at
  }
  return stats
}

/** How long a visitor has been active inside the live window; null when they've only done one thing. */
export const activeSpan = (stat: SessionStat | undefined) => {
  if (!stat || stat.count < 2 || !stat.firstSeen || !stat.lastSeen) return null
  const ms = stat.lastSeen.getTime() - stat.firstSeen.getTime()
  return ms > 0 ? formatDuration(ms) : null
}

// Constructing one of these costs more than the format call, and a live list re-renders every row on
// every hover — so they're kept per timezone. `null` memoizes a timezone Intl rejected.
const clockFormatters = new Map<string, Intl.DateTimeFormat | null>()

const clockFormatter = (tz: string) => {
  const cached = clockFormatters.get(tz)
  if (cached !== undefined) return cached
  let made: Intl.DateTimeFormat | null = null
  try {
    made = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    made = null
  }
  clockFormatters.set(tz, made)
  return made
}

/** Best-effort wall clock in a visitor's own timezone. */
export const localClock = (tz: string | undefined, date: Date | null | undefined) => {
  if (!tz || !date) return null
  return clockFormatter(tz)?.format(date) ?? null
}
