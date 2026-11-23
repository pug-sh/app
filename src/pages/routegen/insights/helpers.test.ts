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
  QueryRequestSchema,
  QueryResponseSchema,
  SessionMetric,
  SessionQuerySchema,
  TrendSeriesSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { getIndexedColor, getSeriesColor, OTHERS_SERIES_COLOR } from '@/lib/event-colors'
import { toProtoTimeRange } from '@/lib/timestamp'
import {
  alignComparisonValues,
  breakdownLabel,
  buildChartData,
  canShareInsight,
  collapseValues,
  emptyReadsAsZero,
  resultFor,
  SERIES_COLLAPSE,
  specAggregationResolver,
  trendSeriesColor,
  trendSeriesNames,
} from './helpers'

const series = (eventKind: string, breakdown: Record<string, string> = {}) =>
  create(TrendSeriesSchema, { eventKind, breakdown })

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

// A session spec carries no event rows (spec.session is set instead), so reading only spec.events
// left every series unclaimed: a console.error per render and a TOTAL fallback that summed a rate
// across buckets. All four traffic-analytics session stats went through here.
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
  // summing reported 57.6: the shape the chart summary would have shown.
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

  // No fixed step for Auto: the axis stays as given, range or not, just instant-keyed and sorted.
  it('leaves the axis untouched when granularity has no step', () => {
    const pts: [Date, number][] = [
      [hour(3), 2],
      [hour(0), 5],
    ]
    const data = buildChartData([seriesAt('page_view', pts)], Granularity.UNSPECIFIED, 'UTC', {
      from: new Date(Date.UTC(2026, 6, 19, 22)),
      to: hour(23),
    })
    expect(times(data)).toEqual([hour(0), hour(3)].map(h => h.getTime()))
    expect(data.map(d => d.values[0])).toEqual([5, 2])
  })

  describe('over the range queried', () => {
    afterEach(() => vi.useRealTimers())

    // The query drops the empty buckets past either end too, so without the range a lone bucket would be the whole axis.
    it('spans it, from the bucket it starts in', () => {
      const range = { from: new Date(Date.UTC(2026, 6, 19, 10, 37)), to: new Date(Date.UTC(2026, 6, 20, 10, 37)) }
      const data = buildChartData([seriesAt('page_view', [[hour(7), 15]])], Granularity.HOUR, 'UTC', range)
      expect(times(data)).toEqual(Array.from({ length: 25 }, (_, h) => Date.UTC(2026, 6, 19, 10 + h)))
      expect(data.map(d => d.values[0])).toEqual(Array.from({ length: 25 }, (_, h) => (h === 21 ? 15 : 0)))
    })

    // The range's end is exclusive, as the backend's `occur_time < to` is.
    it('adds nothing when the data already covers it', () => {
      const pts: [Date, number][] = [
        [hour(0), 5],
        [hour(1), 4],
        [hour(2), 3],
        [hour(3), 2],
      ]
      const data = buildChartData([seriesAt('page_view', pts)], Granularity.HOUR, 'UTC', { from: hour(0), to: hour(4) })
      expect(times(data)).toEqual([0, 1, 2, 3].map(h => hour(h).getTime()))
      expect(data.map(d => d.values[0])).toEqual([5, 4, 3, 2])
    })

    // A custom range runs to the end of its last day, which may not have happened yet.
    it('stops at the bucket in progress', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(Date.UTC(2026, 6, 20, 10, 37)))
      const range = { from: hour(0), to: new Date(Date.UTC(2026, 6, 20, 23, 59, 59, 999)) }
      const data = buildChartData([seriesAt('page_view', [[hour(3), 2]])], Granularity.HOUR, 'UTC', range)
      expect(times(data)).toEqual(Array.from({ length: 11 }, (_, h) => hour(h).getTime()))
    })

    // Kolkata's days start at 18:30 UTC, so a range floored or stepped in UTC lands beside the real buckets.
    it("fills it in the zone's own buckets", () => {
      const istMidnight = (d: number) => new Date(Date.UTC(2026, 2, d - 1, 18, 30))
      const range = { from: new Date(Date.UTC(2026, 2, 8, 7, 30)), to: new Date(Date.UTC(2026, 2, 11, 3, 30)) }
      const pts: [Date, number][] = [[istMidnight(10), 3]]
      const data = buildChartData([seriesAt('page_view', pts)], Granularity.DAY, 'Asia/Kolkata', range)
      expect(times(data)).toEqual([8, 9, 10, 11].map(d => istMidnight(d).getTime()))
      expect(data.map(d => d.values[0])).toEqual([0, 0, 3, 0])
    })

    it('steps weeks from Sunday and months from the 1st', () => {
      const weeks = buildChartData([seriesAt('page_view', [[day(15), 7]])], Granularity.WEEK, 'UTC', {
        from: new Date(Date.UTC(2026, 2, 4, 12)),
        to: new Date(Date.UTC(2026, 2, 24, 12)),
      })
      expect(times(weeks)).toEqual([1, 8, 15, 22].map(d => day(d).getTime()))
      expect(weeks.map(d => d.values[0])).toEqual([0, 0, 7, 0])

      const firstOf = (month: number) => new Date(Date.UTC(2026, month, 1))
      const months = buildChartData([seriesAt('page_view', [[firstOf(1), 9]])], Granularity.MONTH, 'UTC', {
        from: new Date(Date.UTC(2026, 0, 15)),
        to: new Date(Date.UTC(2026, 3, 10)),
      })
      expect(times(months)).toEqual([0, 1, 2, 3].map(m => firstOf(m).getTime()))
      expect(months.map(d => d.values[0])).toEqual([0, 9, 0, 0])
    })
  })

  // A backend without bucketExpr's DateTime cast stamps weeks at the ClickHouse server's midnight (UTC in these
  // fixtures), so a gap closes at the bucket its next one floors to, or each real week gets a zero twin.
  describe("with weeks stamped at the server's midnight", () => {
    it('fills a range east of the server without doubling a week', () => {
      const pts: [Date, number][] = [
        [day(8), 4],
        [day(22), 6],
      ]
      const data = buildChartData([seriesAt('page_view', pts)], Granularity.WEEK, 'Asia/Kolkata', {
        from: new Date(Date.UTC(2026, 2, 9, 12)),
        to: new Date(Date.UTC(2026, 2, 28, 12)),
      })
      expect(times(data)).toEqual([day(8).getTime(), Date.UTC(2026, 2, 14, 18, 30), day(22).getTime()])
      expect(data.map(d => d.values[0])).toEqual([4, 0, 6])
    })

    it('adds nothing between consecutive weeks west of the server', () => {
      const pts: [Date, number][] = [
        [day(1), 1],
        [day(8), 2],
        [day(15), 3],
      ]
      const data = buildChartData([seriesAt('page_view', pts)], Granularity.WEEK, 'America/New_York')
      expect(times(data)).toEqual([1, 8, 15].map(d => day(d).getTime()))
    })
  })
})

describe('trendSeriesColor', () => {
  const split = (breakdown: Record<string, string>) => create(TrendSeriesSchema, { eventKind: 'purchase', breakdown })

  it('mutes the $others overflow instead of giving it the next palette slot', () => {
    expect(trendSeriesColor(split({ category: '$others' }), 4)).toEqual(OTHERS_SERIES_COLOR)
    expect(trendSeriesColor(split({ category: 'toys' }), 4)).toEqual(getIndexedColor(4))
  })

  it('keeps the event colour on an unsplit series', () => {
    expect(trendSeriesColor(series('purchase'), 0)).toEqual(getSeriesColor('purchase', 0))
  })
})

describe('resultFor', () => {
  const range = { from: new Date(Date.UTC(2026, 6, 20)), to: new Date(Date.UTC(2026, 6, 21)) }
  const request = (aggregation: AggregationType) =>
    create(QueryRequestSchema, {
      granularity: Granularity.HOUR,
      timeRange: toProtoTimeRange(range),
      spec: {
        insightType: InsightType.TRENDS,
        events: [{ event: { kind: 'purchase' }, aggregation, aggregationProperty: 'amount' }],
      },
    })

  // An average or minimum of an empty bucket has no value, and a zero there drags the summary's avg and min down.
  it.each([
    ['a count', AggregationType.TOTAL, true],
    ['unique users', AggregationType.UNIQUE_USERS, true],
    ['an average', AggregationType.AVG, false],
    ['a minimum', AggregationType.MIN, false],
  ])('fills %s out to the range only if an empty bucket reads as zero', (_, aggregation, fills) => {
    const answered = resultFor(request(aggregation), create(QueryResponseSchema))
    expect(answered.granularity).toBe(Granularity.HOUR)
    expect(answered.fillRange).toEqual(fills ? range : undefined)
  })
})

// The compare window is its own query, so its bucket count needn't match the one it's drawn over.
describe('alignComparisonValues', () => {
  it('maps one-to-one when the two windows bucket the same', () => {
    expect(alignComparisonValues([1, 2, 3, 4], 4)).toEqual([1, 2, 3, 4])
  })

  // A 31-day month against a 30-day one. Exact, not just endpoints-and-length: asserting the shape
  // loosely passes on [10, 0, 0, 0, 30], which is the zero-collapse this function exists to avoid.
  it('stretches a shorter prior window across the full width', () => {
    expect(alignComparisonValues([10, 20, 30], 5)).toEqual([10, 20, 20, 30, 30])
    expect(alignComparisonValues([1, 2, 3, 4], 7)).toEqual([1, 2, 2, 3, 3, 4, 4])
  })

  it('compresses a longer prior window onto the same buckets', () => {
    const aligned = alignComparisonValues([1, 2, 3, 4, 5], 3)
    expect(aligned).toEqual([1, 3, 5])
  })

  it('has nothing to draw for an empty window', () => {
    expect(alignComparisonValues([], 5)).toEqual([])
    expect(alignComparisonValues([1, 2], 0)).toEqual([])
  })

  // bucketCount 1 is the degenerate case the index scale divides by zero on.
  it('survives a single bucket', () => {
    expect(alignComparisonValues([7, 8, 9], 1)).toEqual([7])
  })
})

describe('canShareInsight', () => {
  const shareable = {
    insightType: InsightType.TRENDS,
    resultCase: 'trends',
    drawnCount: 1,
    loading: false,
    error: null,
    queryKey: '{"timeRange":"7d"}',
    resultKey: '{"timeRange":"7d"}',
  }

  it('offers a share of a drawn result', () => {
    expect(canShareInsight(shareable)).toBe(true)
  })

  // The three staleness cases: useDebouncedQuery holds the old result across a type switch and a
  // refetch, and a zero-count result renders an empty state rather than a chart.
  it('refuses a result left over from the previously selected insight type', () => {
    expect(canShareInsight({ ...shareable, insightType: InsightType.FUNNEL })).toBe(false)
  })

  // The case matches and loading is still false for a render, so the keys are the only tell.
  it('refuses a result left over from the previous query of the same type', () => {
    expect(canShareInsight({ ...shareable, queryKey: '{"timeRange":"30d"}' })).toBe(false)
  })

  it('refuses before the first result lands', () => {
    expect(canShareInsight({ ...shareable, resultKey: undefined })).toBe(false)
  })

  it('refuses while a requery is in flight', () => {
    expect(canShareInsight({ ...shareable, loading: true })).toBe(false)
  })

  it('refuses an empty result', () => {
    expect(canShareInsight({ ...shareable, drawnCount: 0 })).toBe(false)
  })

  it('refuses a map, which snapshots blank from its WebGL canvas', () => {
    expect(canShareInsight({ ...shareable, insightType: InsightType.MAP, resultCase: 'topK' })).toBe(false)
  })

  it('refuses a failed query', () => {
    expect(canShareInsight({ ...shareable, error: 'boom' })).toBe(false)
  })
})

describe('emptyReadsAsZero', () => {
  it.each([
    ['TOTAL', true, AggregationType.TOTAL],
    ['UNSPECIFIED', true, AggregationType.UNSPECIFIED],
    ['UNIQUE_USERS', true, AggregationType.UNIQUE_USERS],
    ['SUM', true, AggregationType.SUM],
    ['PER_USER_AVG', false, AggregationType.PER_USER_AVG],
    ['AVG', false, AggregationType.AVG],
    ['MIN', false, AggregationType.MIN],
    ['MAX', false, AggregationType.MAX],
  ])('reads an empty %s result as zero: %s', (_, zero, aggregation) => {
    expect(emptyReadsAsZero(eventSpec('signup', aggregation))).toBe(zero)
  })

  it('follows the session metric, and needs every row to count', () => {
    expect(emptyReadsAsZero(sessionSpec(SessionMetric.SESSIONS))).toBe(true)
    expect(emptyReadsAsZero(sessionSpec(SessionMetric.BOUNCE_RATE))).toBe(false)
    const mixed = eventSpec('signup', AggregationType.TOTAL)
    mixed.events.push(create(EventQuerySchema, { aggregation: AggregationType.AVG }))
    expect(emptyReadsAsZero(mixed)).toBe(false)
    expect(emptyReadsAsZero(undefined)).toBe(false)
  })
})

describe('breakdownLabel', () => {
  it('names coded values, keyed by the property each came from', () => {
    expect(breakdownLabel({ $country: 'IN', $os: 'Linux' }, 'Series 1')).toBe('India / Linux')
    expect(breakdownLabel({ $continent: 'NA', $country: 'NA' }, 'Series 1')).toBe('North America / Namibia')
    expect(breakdownLabel({ $utmSource: 'IN' }, 'Series 1')).toBe('IN')
    expect(breakdownLabel({}, 'Series 1')).toBe('Series 1')
  })

  it('names an empty value for what it means on its property', () => {
    expect(breakdownLabel({ $referrerDomain: '' }, 'Series 1')).toBe('(no referrer)')
    expect(breakdownLabel({ $utmSource: '' }, 'Series 1')).toBe('(not set)')
    expect(breakdownLabel({ $referrerDomain: '', $country: '' }, 'Series 1')).toBe('(no referrer) / (not set)')
  })

  it('names the overflow once, however many properties the split had', () => {
    expect(breakdownLabel({ $os: '$others' }, 'Series 1')).toBe('(others)')
    expect(breakdownLabel({ $os: '$others', $country: '$others' }, 'Series 1')).toBe('(others)')
  })
})

describe('trendSeriesNames', () => {
  it('names the overflow behind an event prefix too', () => {
    expect(trendSeriesNames([series('page_view', { $os: 'Linux' }), series('signup', { $os: '$others' })])).toEqual([
      'page_view · Linux',
      'signup · (others)',
    ])
  })
})
