import { create } from '@bufbuild/protobuf'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  BreakdownSchema,
  EventQuerySchema,
  type InsightQuerySpec,
  InsightQuerySpecSchema,
  InsightType,
  QueryRequestSchema,
  SessionMetric,
  SessionQuerySchema,
  TopKQuery_Dimension,
  TopKQuerySchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { compactNumber } from '@/lib/format'
import { COUNTRY_PROPERTY } from '../dashboards/activity-map'
import { filterGroupFields } from './web-filters'

// The country auto-property key, shared with the dashboards activity map so the web map query and its
// reader (useActivityMapData) can't disagree on the key.
export { COUNTRY_PROPERTY }

// Web analytics is defined around the pageview: every session metric scopes to `page_view`
// (per docs/architecture/web-analytics.md — bounce = single-*pageview* session, entry states
// computed over pageviews only) and the stat row counts page_view events. The web view is only
// shown when the project actually has this event (see WebAnalyticsMode's empty state).
export const WEB_PRIMARY_KIND = 'page_view'

export type WebStatId = 'users' | 'sessions' | 'pageviews' | 'pagesPerSession' | 'bounceRate' | 'avgDuration'

type StatFormat = 'count' | 'percent' | 'duration' | 'decimal'

// What a stat measures. Event stats count page_view occurrences/uniques; session stats read a
// SessionMetric over page_view-scoped sessions. Both shapes flow through buildWebStatQuery, which
// only picks the insight type (SEGMENTATION → scalar total, TRENDS → time series).
type StatMeasure =
  | { readonly source: 'event'; readonly aggregation: AggregationType }
  | { readonly source: 'session'; readonly metric: SessionMetric }

type WebStat = {
  readonly id: WebStatId
  readonly label: string
  readonly format: StatFormat
  readonly measure: StatMeasure
  // Bounce rate is the only stat that improves by falling; the delta badge colors on this.
  readonly lowerIsBetter?: boolean
}

// `satisfies Record<WebStatId, …>` makes this table total: a new WebStatId without an entry is a
// compile error, not a tile that renders Visitors' numbers under the new label (which is what the old
// `?? WEB_STATS[0]` fallback did). Same standard as GRANULARITY_MAX_RANGE_MS and SERIES_COLLAPSE.
const WEB_STAT_BY_ID = {
  users: {
    label: 'Visitors',
    format: 'count',
    measure: { source: 'event', aggregation: AggregationType.UNIQUE_USERS },
  },
  sessions: {
    label: 'Sessions',
    format: 'count',
    measure: { source: 'session', metric: SessionMetric.SESSIONS },
  },
  pageviews: {
    label: 'Pageviews',
    format: 'count',
    measure: { source: 'event', aggregation: AggregationType.TOTAL },
  },
  pagesPerSession: {
    label: 'Pages / session',
    format: 'decimal',
    measure: { source: 'session', metric: SessionMetric.AVG_EVENTS_PER_SESSION },
  },
  bounceRate: {
    label: 'Bounce rate',
    format: 'percent',
    measure: { source: 'session', metric: SessionMetric.BOUNCE_RATE },
    lowerIsBetter: true,
  },
  avgDuration: {
    label: 'Visit duration',
    format: 'duration',
    measure: { source: 'session', metric: SessionMetric.AVG_DURATION },
  },
} as const satisfies Record<WebStatId, Omit<WebStat, 'id'>>

// The headline stats in stat-row (display) order — declaration order above, so there's no second
// list to keep in step.
export const WEB_STATS: readonly WebStat[] = (Object.keys(WEB_STAT_BY_ID) as WebStatId[]).map(id => ({
  id,
  ...WEB_STAT_BY_ID[id],
}))

// Annotated because the inferred type is a union of the six literal entries, and only one declares
// `lowerIsBetter` — reading it off the union is a type error at the call site.
export const getWebStat = (id: WebStatId): Omit<WebStat, 'id'> => WEB_STAT_BY_ID[id]

// hasOwn, not `in`: `in` walks the prototype, so `?stat=toString` would pass and then index to a
// function with no label.
export const isWebStatId = (value: unknown): value is WebStatId =>
  typeof value === 'string' && Object.hasOwn(WEB_STAT_BY_ID, value)

// page_view-scoped EventFilter, rebuilt per call (bufbuild messages are mutable, so a shared
// instance could be aliased into two specs).
const pageViewScope = () => create(EventFilterSchema, { kind: WEB_PRIMARY_KIND })

const measureSpecFields = (measure: StatMeasure) => {
  if (measure.source === 'event') {
    return {
      events: [create(EventQuerySchema, { event: pageViewScope(), aggregation: measure.aggregation })],
    }
  }
  return { session: create(SessionQuerySchema, { metric: measure.metric, scope: pageViewScope() }) }
}

// Wrap a built InsightQuerySpec in the shared QueryRequest envelope. Each builder creates its own spec
// as a fresh literal (folding active cross-filters in via filterGroupFields); this only adds the
// envelope, so no builder repeats it.
const webQuery = (spec: InsightQuerySpec) => create(QueryRequestSchema, { spec })

// Build a stat query. SEGMENTATION yields the exact window scalar (SegmentationResult.total) for the
// stat tiles; TRENDS yields the bucketed series that drives the main chart. Active cross-filters are
// applied via filter groups.
export const buildWebStatQuery = (
  id: WebStatId,
  insightType: InsightType.SEGMENTATION | InsightType.TRENDS,
  filters: readonly ActiveFilter[] = [],
) =>
  webQuery(
    create(InsightQuerySpecSchema, {
      insightType,
      ...measureSpecFields(getWebStat(id).measure),
      ...filterGroupFields(filters),
    }),
  )

// --- Breakdown panel queries -------------------------------------------------

const DEFAULT_BREAKDOWN_LIMIT = 50

// Ranked top-K over an auto-property (Countries, Browsers, Pages by $url, …), scoped to page_view so
// the counts are pageview-grain. metric picks visitors (UNIQUE_USERS) vs pageviews (TOTAL).
export const buildTopKBreakdownQuery = (
  property: string,
  metric: AggregationType,
  filters: readonly ActiveFilter[] = [],
  limit = DEFAULT_BREAKDOWN_LIMIT,
) =>
  webQuery(
    create(InsightQuerySpecSchema, {
      insightType: InsightType.TOP_K,
      topK: create(TopKQuerySchema, {
        dimension: TopKQuery_Dimension.PROPERTY,
        property,
        scope: pageViewScope(),
        metric,
        limit,
      }),
      ...filterGroupFields(filters),
    }),
  )

// Ranked top-K over event kinds ("top events"), across all events (no page_view scope).
export const buildEventKindTopKQuery = (filters: readonly ActiveFilter[] = [], limit = DEFAULT_BREAKDOWN_LIMIT) =>
  webQuery(
    create(InsightQuerySpecSchema, {
      insightType: InsightType.TOP_K,
      topK: create(TopKQuerySchema, {
        dimension: TopKQuery_Dimension.EVENT_KIND,
        metric: AggregationType.TOTAL,
        limit,
      }),
      ...filterGroupFields(filters),
    }),
  )

// Session ENTRY/EXIT breakdown (first-touch/last-touch page). Must be TRENDS with exactly one
// breakdown (backend CEL session_page_metrics_require_trends_breakdown); it returns a series per
// value that the caller collapses to a per-page session count.
export const buildSessionBreakdownQuery = (
  metric: SessionMetric.ENTRY | SessionMetric.EXIT,
  property: string,
  filters: readonly ActiveFilter[] = [],
  limit = DEFAULT_BREAKDOWN_LIMIT,
) =>
  webQuery(
    create(InsightQuerySpecSchema, {
      insightType: InsightType.TRENDS,
      session: create(SessionQuerySchema, { metric, scope: pageViewScope() }),
      breakdowns: [create(BreakdownSchema, { property })],
      breakdownLimit: limit,
      ...filterGroupFields(filters),
    }),
  )

// Pageviews-by-country for the map, with active cross-filters applied (the map's own $country filter
// is excluded by the caller so all countries stay visible/clickable). Mirrors the dashboards'
// buildCountryBreakdownQuery shape so useActivityMapData can read it.
export const buildCountryMapQuery = (filters: readonly ActiveFilter[] = []) =>
  webQuery(
    create(InsightQuerySpecSchema, {
      insightType: InsightType.TRENDS,
      events: [create(EventQuerySchema, { event: pageViewScope(), aggregation: AggregationType.TOTAL })],
      breakdowns: [create(BreakdownSchema, { property: COUNTRY_PROPERTY })],
      breakdownLimit: DEFAULT_BREAKDOWN_LIMIT,
      ...filterGroupFields(filters),
    }),
  )

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
export const formatWebStatValue = (id: WebStatId, value: number) => {
  const format = getWebStat(id).format
  if (format === 'percent') return `${value.toFixed(1)}%`
  if (format === 'duration') return formatDuration(value)
  if (format === 'decimal') return value.toLocaleString('en-US', { maximumFractionDigits: 1 })
  return compactNumber(value)
}
