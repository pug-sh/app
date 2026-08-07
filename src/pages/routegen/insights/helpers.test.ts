import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  DataPointSchema,
  EventQuerySchema,
  Granularity,
  InsightQuerySpecSchema,
  InsightType,
  SessionMetric,
  SessionQuerySchema,
  TrendSeriesSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import {
  alignComparisonValues,
  buildChartData,
  collapseValues,
  SERIES_COLLAPSE,
  specAggregationResolver,
} from './helpers'

const series = (eventKind: string) => create(TrendSeriesSchema, { eventKind })

const sessionSpec = (metric: SessionMetric) =>
  create(InsightQuerySpecSchema, {
    insightType: InsightType.TRENDS,
    session: create(SessionQuerySchema, { metric, scope: create(EventFilterSchema, { kind: 'page_view' }) }),
  })

const eventSpec = (kind: string, aggregation: AggregationType) =>
  create(InsightQuerySpecSchema, {
    insightType: InsightType.TRENDS,
    events: [create(EventQuerySchema, { event: create(EventFilterSchema, { kind }), aggregation })],
  })

// A session spec carries no event rows — spec.session is set instead — so reading only spec.events
// left every series unclaimed: a console.error per render and a TOTAL fallback that summed a rate
// across buckets. All four web-analytics session stats went through here.
describe('specAggregationResolver on session specs', () => {
  afterEach(() => vi.restoreAllMocks())

  it('resolves per-session averages to AVG, not the TOTAL fallback', () => {
    for (const metric of [
      SessionMetric.AVG_EVENTS_PER_SESSION,
      SessionMetric.BOUNCE_RATE,
      SessionMetric.AVG_DURATION,
    ]) {
      expect(specAggregationResolver(sessionSpec(metric))(series('page_view'))).toBe(AggregationType.AVG)
    }
  })

  it('resolves session counts to TOTAL', () => {
    for (const metric of [SessionMetric.SESSIONS, SessionMetric.ENTRY, SessionMetric.EXIT]) {
      expect(specAggregationResolver(sessionSpec(metric))(series('page_view'))).toBe(AggregationType.TOTAL)
    }
  })

  it('claims the series instead of reporting it unmatched', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    specAggregationResolver(sessionSpec(SessionMetric.BOUNCE_RATE))(series('page_view'))
    expect(error).not.toHaveBeenCalled()
  })

  // The reason the fallback mattered: a 24-bucket window of a steady 2.4 pages/session is 2.4, and
  // summing reported 57.6 — the shape the chart summary would have shown.
  it('collapses a bucketed average to the average, not the sum', () => {
    const aggregation = specAggregationResolver(sessionSpec(SessionMetric.AVG_EVENTS_PER_SESSION))(series('page_view'))
    expect(collapseValues(Array(24).fill(2.4), SERIES_COLLAPSE[aggregation])).toBeCloseTo(2.4)
  })
})

// The event path is what every other tile takes; the session branch must not have moved it.
describe('specAggregationResolver on event specs', () => {
  it('reads the row aggregation', () => {
    const resolver = specAggregationResolver(eventSpec('page_view', AggregationType.UNIQUE_USERS))
    expect(resolver(series('page_view'))).toBe(AggregationType.UNIQUE_USERS)
  })

  it('lets a lone row own a series that came back under another kind', () => {
    const resolver = specAggregationResolver(eventSpec('', AggregationType.UNIQUE_USERS))
    expect(resolver(series('signup'))).toBe(AggregationType.UNIQUE_USERS)
  })

  it('falls back to TOTAL for an undefined spec', () => {
    expect(specAggregationResolver(undefined)(series('page_view'))).toBe(AggregationType.TOTAL)
  })
})

// Trends come back sparse (empty buckets dropped, series needn't share buckets); the chart assumes
// uniform rows, so a gapped axis overlaps clustered bars. buildChartData rebuilds a dense grid.
describe('buildChartData', () => {
  const hour = (h: number) => new Date(Date.UTC(2026, 6, 20, h))
  const day = (d: number) => new Date(Date.UTC(2026, 2, d)) // March 2026
  const seriesAt = (eventKind: string, points: [Date, number][]) =>
    create(TrendSeriesSchema, {
      eventKind,
      points: points.map(([date, value]) => create(DataPointSchema, { time: timestampFromDate(date), value })),
    })
  const times = (data: { date: Date }[]) => data.map(d => d.date.getTime())

  // Hour 02:00 was absent; without a zero row for it, 0/1/3 draw as three evenly-spaced bars.
  it('zero-fills the empty buckets the query dropped', () => {
    const pts: [Date, number][] = [
      [hour(0), 5],
      [hour(1), 4],
      [hour(3), 2],
    ]
    const data = buildChartData([seriesAt('page_view', pts)], Granularity.HOUR, 'UTC')
    expect(times(data)).toEqual([hour(0), hour(1), hour(2), hour(3)].map(h => h.getTime()))
    expect(data.map(d => d.values[0])).toEqual([5, 4, 0, 2])
  })

  // The old positional read plotted Android's 01:00 at Linux's 02:00; keying by instant fixes it.
  it('aligns series by bucket instant, not row position', () => {
    const linux = seriesAt('page_view', [
      [hour(0), 5],
      [hour(2), 7],
    ])
    const android = seriesAt('page_view', [[hour(1), 3]])
    const data = buildChartData([linux, android], Granularity.HOUR, 'UTC')
    expect(times(data)).toEqual([hour(0), hour(1), hour(2)].map(h => h.getTime()))
    expect(data.map(d => d.values)).toEqual([
      [5, 0],
      [0, 3],
      [7, 0],
    ])
  })

  it('steps day-granularity gaps by calendar day', () => {
    const pts: [Date, number][] = [
      [day(8), 1],
      [day(11), 4],
    ]
    const data = buildChartData([seriesAt('page_view', pts)], Granularity.DAY, 'UTC')
    expect(times(data)).toEqual([day(8), day(9), day(10), day(11)].map(d => d.getTime()))
    expect(data.map(d => d.values[0])).toEqual([1, 0, 0, 4])
  })

  // No fixed step for Auto — leave the axis as given, just instant-keyed and sorted.
  it('leaves the axis untouched when granularity has no step', () => {
    const pts: [Date, number][] = [
      [hour(3), 2],
      [hour(0), 5],
    ]
    const data = buildChartData([seriesAt('page_view', pts)], Granularity.UNSPECIFIED, 'UTC')
    expect(times(data)).toEqual([hour(0), hour(3)].map(h => h.getTime()))
    expect(data.map(d => d.values[0])).toEqual([5, 2])
  })
})

// The compare window is its own query, so its bucket count needn't match the one it's drawn over.
describe('alignComparisonValues', () => {
  const points = (...values: number[]) => values.map(value => create(DataPointSchema, { value }))

  it('maps one-to-one when the two windows bucket the same', () => {
    expect(alignComparisonValues(points(1, 2, 3, 4), 4)).toEqual([1, 2, 3, 4])
  })

  // A 31-day month against a 30-day one. Exact, not just endpoints-and-length: asserting the shape
  // loosely passes on [10, 0, 0, 0, 30], which is the zero-collapse this function exists to avoid.
  it('stretches a shorter prior window across the full width', () => {
    expect(alignComparisonValues(points(10, 20, 30), 5)).toEqual([10, 20, 20, 30, 30])
    expect(alignComparisonValues(points(1, 2, 3, 4), 7)).toEqual([1, 2, 2, 3, 3, 4, 4])
  })

  it('compresses a longer prior window onto the same buckets', () => {
    const aligned = alignComparisonValues(points(1, 2, 3, 4, 5), 3)
    expect(aligned).toEqual([1, 3, 5])
  })

  it('has nothing to draw for an empty window', () => {
    expect(alignComparisonValues([], 5)).toEqual([])
    expect(alignComparisonValues(points(1, 2), 0)).toEqual([])
  })

  // bucketCount 1 is the degenerate case the index scale divides by zero on.
  it('survives a single bucket', () => {
    expect(alignComparisonValues(points(7, 8, 9), 1)).toEqual([7])
  })
})
