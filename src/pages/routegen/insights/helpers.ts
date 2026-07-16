import { AggregationType, type FunnelSeries, type TrendSeries } from '@/api/genproto/shared/insights/v1/insights_pb'
import { tsToDate } from '@/lib/timestamp'

// How a series' per-bucket values collapse into the one number a KPI or a summary headline shows.
//
// Counts add across buckets; nothing else does. The same person active on two days is one unique
// user rather than two, and per-bucket averages, minimums and maximums don't add at all. For the
// user counts this is not a compromise but the only reading available: the series carry counts, not
// identities, so a range-wide unique total can't be recovered from them at any price — it would take
// its own query. A caller that shows an averaged number should name it as one.
//
// Total over AggregationType (`satisfies Record<…>`, as GRANULARITY_MAX_RANGE_MS does for
// Granularity): a new member without an entry is a compile error rather than a silent 'sum', which
// is the wrong answer for everything here that isn't already a count.
export type SeriesCollapse = 'sum' | 'avg' | 'min' | 'max'

export const SERIES_COLLAPSE = {
  // A spec that never set an aggregation carries UNSPECIFIED (proto enums default to 0, so `??`
  // never sees it) and the backend reads that as TOTAL — insights/builder.go does the same coercion.
  [AggregationType.UNSPECIFIED]: 'sum',
  [AggregationType.TOTAL]: 'sum',
  [AggregationType.SUM]: 'sum',
  [AggregationType.UNIQUE_USERS]: 'avg',
  [AggregationType.PER_USER_AVG]: 'avg',
  [AggregationType.AVG]: 'avg',
  [AggregationType.MIN]: 'min',
  [AggregationType.MAX]: 'max',
} as const satisfies Record<AggregationType, SeriesCollapse>

export const collapseValues = (values: number[], collapse: SeriesCollapse) => {
  if (values.length === 0) return 0
  if (collapse === 'min') return Math.min(...values)
  if (collapse === 'max') return Math.max(...values)
  const total = values.reduce((sum, value) => sum + value, 0)
  if (collapse === 'avg') return total / values.length
  return total
}

// An event row as the resolver below needs it: the two pages model rows differently (proto
// EventQuery vs the event-filter UI entries), and neither shape is worth teaching a helper about.
type EventAggregation = { kind: string; aggregation?: AggregationType }

export type SeriesAggregationResolver = (series: TrendSeries) => AggregationType

// Which event row's aggregation produced a given series.
//
// A resolver rather than an array of aggregations, because a positional array only describes the
// series list it was built from — and a KPI's comparison window is a separate query with its own
// series, which may differ in count and order (a breakdown value present in one window and not the
// other). Handing it the current window's indices is how a compare delta goes wrong.
export const seriesAggregationResolver = (events: readonly EventAggregation[]): SeriesAggregationResolver => {
  // A lone row owns every series in the response, whatever a breakdown split them into — and
  // whatever kind they came back under, which matters because `kind: ''` means "all events" and
  // those series are named for the real kinds, matching no row by name.
  if (events.length === 1) {
    const only = events[0].aggregation ?? AggregationType.TOTAL
    return () => only
  }

  // Several rows: kind is the only link back. The backend keys series by (event_kind, breakdown)
  // and TrendSeries carries no event index, so two rows of the same kind are indistinguishable
  // here — it merges them into one series before this ever runs.
  const byKind = new Map(events.map(entry => [entry.kind, entry.aggregation ?? AggregationType.TOTAL]))
  let warned = false
  return series => {
    const aggregation = byKind.get(series.eventKind)
    if (aggregation !== undefined) return aggregation
    // No row claims this series, so there is no honest answer to give. Summing is the only guess
    // available and it is the wrong one for every collapse above that isn't 'sum' — inflating by
    // roughly the bucket count — so don't let it pass unremarked.
    if (!warned) {
      warned = true
      console.error('Insights: no event row matches series kind', {
        kind: series.eventKind,
        rows: [...byKind.keys()],
      })
    }
    return AggregationType.TOTAL
  }
}

export const resolveSeriesAggregations = (events: readonly EventAggregation[], series: TrendSeries[]) =>
  series.map(seriesAggregationResolver(events))

type ChartPoint = {
  date: Date
  values: number[]
}

export const sortFunnelSteps = (steps: FunnelSeries['steps'], kindOrder: string[]) => {
  const byKind = new Map(steps.map(s => [s.eventKind, Number(s.total) || 0]))
  return kindOrder.map((kind, i) => ({ name: kind || `Step ${i + 1}`, count: byKind.get(kind) ?? 0 }))
}

// Shown wherever a property value is empty — an event carrying no $utmSource, no $os,
// and so on. The backend counts those events as a real bucket rather than dropping them,
// in breakdowns and in top-k alike, so both render this. Deliberately generic: the
// property decides what "empty" means, and one label serves every key. Resist naming it
// for one property's story — "(direct)" would be wrong even for $utmSource, whose empty
// bucket is every untagged visit (app sessions, organic search, untagged referrals),
// not the referrer-derived direct traffic that name implies.
export const EMPTY_VALUE_LABEL = '(none)'

// A series with no breakdown keys is unsplit: the backend returns exactly one such
// series when the request asked for no breakdown. That is distinct from a requested
// breakdown that resolved to an empty value, which is a real bucket and must not be
// mistaken for the unsplit total.
export const hasBreakdown = (breakdown: Record<string, string>) => Object.keys(breakdown).length > 0

export const breakdownLabel = (breakdown: Record<string, string>, fallback: string) => {
  if (!hasBreakdown(breakdown)) return fallback
  return Object.values(breakdown)
    .map(value => value || EMPTY_VALUE_LABEL)
    .join(' / ')
}

// Names for trends series, for everything that displays them alike — chart tooltip and legend, table
// headers, the summary grid. One source, so they can't disagree about what a series is called.
//
// The "event · value" prefix only earns its place when there is more than one event kind on the
// chart to tell apart. With a single event — every Overview tile, and most insights — the chart
// already says which event it is, and the prefix only repeats it on every row: "click · Linux",
// "click · macOS", "click · Android". Keyed on distinct kinds rather than the number of event rows
// because that is what the prefix disambiguates; same-kind rows would read alike either way, and the
// backend merges them into one series before this runs.
export const trendSeriesNames = (trendSeries: TrendSeries[]) => {
  const showEventKind = new Set(trendSeries.map(series => series.eventKind)).size > 1
  return trendSeries.map((series, index) => {
    if (!hasBreakdown(series.breakdown)) return series.eventKind || `Series ${index + 1}`
    const value = breakdownLabel(series.breakdown, '')
    if (showEventKind && series.eventKind) return `${series.eventKind} · ${value}`
    return value
  })
}

export const disambiguateLabels = (labels: string[]) => {
  const seen = new Map<string, number>()
  return labels.map(label => {
    const count = (seen.get(label) ?? 0) + 1
    seen.set(label, count)
    return count > 1 ? `${label} (${count})` : label
  })
}

export const buildChartData = (trendSeries: TrendSeries[]): ChartPoint[] => {
  if (trendSeries.length === 0) return []

  return trendSeries[0].points
    .map((p, i) => {
      const date = tsToDate(p.time)
      if (!date) return null
      return {
        date,
        values: trendSeries.map(s => Number(s.points[i]?.value) || 0),
      }
    })
    .filter((d): d is ChartPoint => d !== null)
}
