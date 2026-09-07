import { describe, expect, it } from 'vitest'
import { AggregationType, InsightType, TopKQuery_Dimension } from '@/api/genproto/shared/insights/v1/insights_pb'
import { createEntry } from '@/hooks/use-event-filters'
import { cookielessAffectsQuery } from './cookieless'
import { DEFAULT_MAP } from './map'
import { DEFAULT_TOP_K } from './top-k'

const affects = (over: Partial<Parameters<typeof cookielessAffectsQuery>[0]>) =>
  cookielessAffectsQuery({
    insightType: InsightType.TRENDS,
    entries: [],
    topK: DEFAULT_TOP_K,
    map: DEFAULT_MAP,
    ...over,
  })

const trendsOn = (aggregation: AggregationType) => affects({ entries: [createEntry('page_view', { aggregation })] })

describe('cookielessAffectsQuery', () => {
  // The two halves of the backend's excludeCookielessForAgg, which is what the toggle has to
  // agree with. Counting events is never affected — a consent-rejector's pageview is a pageview.
  it('is true for the trends measures that count or divide by people', () => {
    expect(trendsOn(AggregationType.UNIQUE_USERS)).toBe(true)
    expect(trendsOn(AggregationType.PER_USER_AVG)).toBe(true)
  })

  it('is false for the trends measures that count events or properties', () => {
    expect(trendsOn(AggregationType.TOTAL)).toBe(false)
    expect(trendsOn(AggregationType.SUM)).toBe(false)
    expect(trendsOn(AggregationType.AVG)).toBe(false)
    expect(trendsOn(AggregationType.MIN)).toBe(false)
    expect(trendsOn(AggregationType.MAX)).toBe(false)
  })

  // An event row carries no aggregation until one is picked; the query then runs as TOTAL.
  it('reads a row with no measure as Total events', () => {
    expect(affects({ entries: [createEntry('page_view')] })).toBe(false)
  })

  // Any row is enough: the flag rides on the whole spec, so one Unique users series among Totals
  // still changes the answer.
  it('is true when any one row counts people', () => {
    const entries = [
      createEntry('page_view', { aggregation: AggregationType.TOTAL }),
      createEntry('signup', { aggregation: AggregationType.UNIQUE_USERS }),
    ]
    expect(affects({ entries })).toBe(true)
  })

  // excludeCookielessForPersons: these resolve events per person whatever the measure, and a
  // daily-rotating id structurally breaks that across days.
  it('is true for every person-based insight type, regardless of measure', () => {
    for (const insightType of [InsightType.FUNNEL, InsightType.RETENTION, InsightType.USER_FLOW]) {
      expect(affects({ insightType })).toBe(true)
    }
  })

  // Top-K is the one type that consults both predicates: the metric, and — since ranking users
  // ranks people themselves — the dimension.
  it('is true for a top-K over users on a measure that counts events', () => {
    const topK = { ...DEFAULT_TOP_K, dimension: TopKQuery_Dimension.USER, metric: AggregationType.TOTAL }
    expect(affects({ insightType: InsightType.TOP_K, topK })).toBe(true)
  })

  it('is true for a top-K ranking events by unique users', () => {
    const topK = { ...DEFAULT_TOP_K, metric: AggregationType.UNIQUE_USERS }
    expect(affects({ insightType: InsightType.TOP_K, topK })).toBe(true)
  })

  it('is false for a top-K ranking events by total', () => {
    expect(affects({ insightType: InsightType.TOP_K, topK: DEFAULT_TOP_K })).toBe(false)
  })

  // A map is a top-K over $country, so only its metric can pull people into the answer.
  it('follows the map metric', () => {
    expect(affects({ insightType: InsightType.MAP, map: DEFAULT_MAP })).toBe(false)
    expect(
      affects({ insightType: InsightType.MAP, map: { ...DEFAULT_MAP, metric: AggregationType.UNIQUE_USERS } }),
    ).toBe(true)
  })
})
