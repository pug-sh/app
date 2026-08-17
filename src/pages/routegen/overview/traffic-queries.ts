import { create, type MessageInitShape } from '@bufbuild/protobuf'
import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  BreakdownSchema,
  EventQuerySchema,
  InsightQuerySpecSchema,
  InsightType,
  MapQuerySchema,
  QueryRequestSchema,
  SessionMetric,
  SessionQuerySchema,
  TopKQuery_Dimension,
  TopKQuerySchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { resolveKind } from '@/lib/event-aliases'
import { compactNumber } from '@/lib/format'
import { COUNTRY_PROPERTY } from '../dashboards/activity-map'
import { INCLUDE_COOKIELESS } from './cookieless'
import { filterGroupFields } from './traffic-filters'

// Shared with the dashboards activity map so the query and useActivityMapData can't disagree.
export { COUNTRY_PROPERTY }

// Every session metric scopes to the navigation event (per docs/architecture/web-analytics.md,
// bounce = single-*navigation* session). Web SDKs emit page_view, the mobile ones screen_view.
export const NAV_KINDS = ['page_view', 'screen_view'] as const

export type NavKind = (typeof NAV_KINDS)[number]

// `kind` picks the view's vocabulary and panels; `name` is the raw event name every query scopes on,
// so a project spelling it `pageview` gets page_view's labels and still queries its own events.
export type NavEvent = { readonly kind: NavKind; readonly name: string }

// The busiest navigation event wins, convention order breaks a tie: one stray page_view (a retired
// landing page, a Flutter web build) shouldn't pin a mobile project to a vocabulary its data has
// none of. Null = the project sends neither, the one case the view has nothing to show.
export const resolveNavEvent = (events: readonly EventNameMeta[]): NavEvent | null => {
  const found = events.flatMap(event => {
    const kind = NAV_KINDS.find(candidate => resolveKind(event.name) === candidate)
    return kind ? [{ kind, name: event.name, count: event.count ?? 0n }] : []
  })
  found.sort((a, b) => Number(b.count - a.count) || NAV_KINDS.indexOf(a.kind) - NAV_KINDS.indexOf(b.kind))
  return found[0] ? { kind: found[0].kind, name: found[0].name } : null
}

// Ids stay page-flavored even where the label doesn't: `stat` is a URL param, so renaming them would
// drop the stat out of every already-shared link.
export type TrafficStatId = 'users' | 'sessions' | 'pageviews' | 'pagesPerSession' | 'bounceRate' | 'avgDuration'

type StatFormat = 'count' | 'percent' | 'duration' | 'decimal'

type StatMeasure =
  | { readonly source: 'event'; readonly aggregation: AggregationType }
  | { readonly source: 'session'; readonly metric: SessionMetric }

type TrafficStat = {
  readonly id: TrafficStatId
  // Total over NavKind so a new navigation event can't ship with a page's vocabulary. Also the
  // view's whole vocabulary: the breakdown panels' metric picker reads it too.
  readonly label: Record<NavKind, string>
  readonly format: StatFormat
  readonly measure: StatMeasure
  // Bounce rate is the only stat that improves by falling; the delta badge colors on this.
  readonly lowerIsBetter?: boolean
}

// `satisfies Record<TrafficStatId, …>` makes this table total: a new id without an entry is a
// compile error, not a tile rendering Visitors' numbers under the new label.
const TRAFFIC_STAT_BY_ID = {
  users: {
    label: { page_view: 'Visitors', screen_view: 'Users' },
    format: 'count',
    measure: { source: 'event', aggregation: AggregationType.UNIQUE_USERS },
  },
  sessions: {
    label: { page_view: 'Sessions', screen_view: 'Sessions' },
    format: 'count',
    measure: { source: 'session', metric: SessionMetric.SESSIONS },
  },
  pageviews: {
    label: { page_view: 'Pageviews', screen_view: 'Screen views' },
    format: 'count',
    measure: { source: 'event', aggregation: AggregationType.TOTAL },
  },
  pagesPerSession: {
    label: { page_view: 'Pages / session', screen_view: 'Screens / session' },
    format: 'decimal',
    measure: { source: 'session', metric: SessionMetric.AVG_EVENTS_PER_SESSION },
  },
  bounceRate: {
    label: { page_view: 'Bounce rate', screen_view: 'Bounce rate' },
    format: 'percent',
    measure: { source: 'session', metric: SessionMetric.BOUNCE_RATE },
    lowerIsBetter: true,
  },
  avgDuration: {
    // Both read "visit", not "session": AVG_DURATION spans the first to the last *navigation*, so a
    // session that opens one screen and sits there measures 0 no matter how long it lasted.
    label: { page_view: 'Visit duration', screen_view: 'Visit duration' },
    format: 'duration',
    measure: { source: 'session', metric: SessionMetric.AVG_DURATION },
  },
} as const satisfies Record<TrafficStatId, Omit<TrafficStat, 'id'>>

// Display order is declaration order above, so there's no second list to keep in step.
export const TRAFFIC_STATS: readonly TrafficStat[] = (Object.keys(TRAFFIC_STAT_BY_ID) as TrafficStatId[]).map(id => ({
  id,
  ...TRAFFIC_STAT_BY_ID[id],
}))

// Annotated because the inferred type is a union of the six literal entries, and only one declares
// `lowerIsBetter` — reading it off the union is a type error at the call site.
export const getTrafficStat = (id: TrafficStatId): Omit<TrafficStat, 'id'> => TRAFFIC_STAT_BY_ID[id]

// hasOwn, not `in`: `in` walks the prototype, so `?stat=toString` would pass and then index to a
// function with no label.
export const isTrafficStatId = (value: unknown): value is TrafficStatId =>
  typeof value === 'string' && Object.hasOwn(TRAFFIC_STAT_BY_ID, value)

// Rebuilt per call: bufbuild messages are mutable, so a shared instance could be aliased into two
// specs. Takes NavEvent.name, the project's own spelling of the event.
const navScope = (navEvent: string) => create(EventFilterSchema, { kind: navEvent })

const measureSpecFields = (navEvent: string, measure: StatMeasure) => {
  if (measure.source === 'event') {
    return {
      events: [create(EventQuerySchema, { event: navScope(navEvent), aggregation: measure.aggregation })],
    }
  }
  return { session: create(SessionQuerySchema, { metric: measure.metric, scope: navScope(navEvent) }) }
}

// Wrap a spec in the shared QueryRequest envelope, so no builder repeats it. Takes the init shape and
// not a built message: spreading a message strips the prototype protobuf-es reads field defaults off.
const trafficQuery = (spec: MessageInitShape<typeof InsightQuerySpecSchema>) =>
  create(QueryRequestSchema, { spec: { ...spec, ...INCLUDE_COOKIELESS } })

// SEGMENTATION yields the exact window scalar (SegmentationResult.total) for the stat tiles; TRENDS
// yields the bucketed series that drives the main chart.
export const buildTrafficStatQuery = (
  navEvent: string,
  id: TrafficStatId,
  insightType: InsightType.SEGMENTATION | InsightType.TRENDS,
  filters: readonly ActiveFilter[] = [],
) =>
  trafficQuery({
    insightType,
    ...measureSpecFields(navEvent, getTrafficStat(id).measure),
    ...filterGroupFields(filters),
  })

// --- Breakdown panel queries -------------------------------------------------

const DEFAULT_BREAKDOWN_LIMIT = 50

// Ranked top-K over a property (Countries, Browsers, Pages by $pathname, Screens by screenName, …),
// scoped to the navigation event so the counts are navigation-grain.
export const buildTopKBreakdownQuery = (
  navEvent: string,
  property: string,
  metric: AggregationType,
  filters: readonly ActiveFilter[] = [],
  limit = DEFAULT_BREAKDOWN_LIMIT,
) =>
  trafficQuery({
    insightType: InsightType.TOP_K,
    topK: create(TopKQuerySchema, {
      dimension: TopKQuery_Dimension.PROPERTY,
      property,
      scope: navScope(navEvent),
      metric,
      limit,
    }),
    ...filterGroupFields(filters),
  })

// Ranked top-K over event kinds ("top events"), across all events (no navigation scope).
export const buildEventKindTopKQuery = (filters: readonly ActiveFilter[] = [], limit = DEFAULT_BREAKDOWN_LIMIT) =>
  trafficQuery({
    insightType: InsightType.TOP_K,
    topK: create(TopKQuerySchema, {
      dimension: TopKQuery_Dimension.EVENT_KIND,
      metric: AggregationType.TOTAL,
      limit,
    }),
    ...filterGroupFields(filters),
  })

// Session ENTRY/EXIT breakdown (first-touch/last-touch page or screen). Must be TRENDS with exactly
// one breakdown (backend CEL session_page_metrics_require_trends_breakdown); it returns a series per
// value that the caller collapses to a per-value session count.
export const buildSessionBreakdownQuery = (
  navEvent: string,
  metric: SessionMetric.ENTRY | SessionMetric.EXIT,
  property: string,
  filters: readonly ActiveFilter[] = [],
  limit = DEFAULT_BREAKDOWN_LIMIT,
) =>
  trafficQuery({
    insightType: InsightType.TRENDS,
    session: create(SessionQuerySchema, { metric, scope: navScope(navEvent) }),
    breakdowns: [create(BreakdownSchema, { property })],
    breakdownLimit: limit,
    ...filterGroupFields(filters),
  })

// Views-by-country for the map (the caller excludes its own $country filter so all countries stay
// clickable). MAP fixes the dimension to $country server-side, so it carries no top-N to truncate.
export const buildCountryMapQuery = (navEvent: string, filters: readonly ActiveFilter[] = []) =>
  trafficQuery({
    insightType: InsightType.MAP,
    map: create(MapQuerySchema, { scope: navScope(navEvent), metric: AggregationType.TOTAL }),
    ...filterGroupFields(filters),
  })

// --- Value formatting --------------------------------------------------------

const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const remSeconds = total % 60
  if (minutes < 60) return remSeconds ? `${minutes}m ${remSeconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`
}

// Format a stat value for display. Bounce rate arrives 0–100 (backend already scales ×100),
// duration in seconds, pages/session as a fractional average.
export const formatTrafficStatValue = (id: TrafficStatId, value: number) => {
  const format = getTrafficStat(id).format
  if (format === 'percent') return `${value.toFixed(1)}%`
  if (format === 'duration') return formatDuration(value)
  if (format === 'decimal') return value.toLocaleString('en-US', { maximumFractionDigits: 1 })
  return compactNumber(value)
}
