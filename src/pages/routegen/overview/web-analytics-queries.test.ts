import { describe, expect, it } from 'vitest'
import {
  AggregationType,
  InsightType,
  SessionMetric,
  TopKQuery_Dimension,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import {
  buildEventKindTopKQuery,
  buildSessionBreakdownQuery,
  buildTopKBreakdownQuery,
  buildWebStatQuery,
  formatWebStatValue,
  WEB_PRIMARY_KIND,
} from './web-analytics-queries'

describe('buildWebStatQuery', () => {
  it('users is a page_view UNIQUE_USERS event, no session', () => {
    const spec = buildWebStatQuery('users', InsightType.SEGMENTATION).spec!
    expect(spec.insightType).toBe(InsightType.SEGMENTATION)
    expect(spec.session).toBeUndefined()
    expect(spec.events).toHaveLength(1)
    expect(spec.events[0].event?.kind).toBe(WEB_PRIMARY_KIND)
    expect(spec.events[0].aggregation).toBe(AggregationType.UNIQUE_USERS)
  })

  it('pageviews is a page_view TOTAL event', () => {
    const spec = buildWebStatQuery('pageviews', InsightType.TRENDS).spec!
    expect(spec.insightType).toBe(InsightType.TRENDS)
    expect(spec.events[0].aggregation).toBe(AggregationType.TOTAL)
  })

  it('session stats set spec.session scoped to page_view and carry no events', () => {
    const spec = buildWebStatQuery('sessions', InsightType.SEGMENTATION).spec!
    expect(spec.events).toHaveLength(0)
    expect(spec.session?.metric).toBe(SessionMetric.SESSIONS)
    expect(spec.session?.scope?.kind).toBe(WEB_PRIMARY_KIND)
  })

  it('maps each session stat to its metric', () => {
    const metricOf = (id: Parameters<typeof buildWebStatQuery>[0]) =>
      buildWebStatQuery(id, InsightType.SEGMENTATION).spec!.session?.metric
    expect(metricOf('bounceRate')).toBe(SessionMetric.BOUNCE_RATE)
    expect(metricOf('avgDuration')).toBe(SessionMetric.AVG_DURATION)
    expect(metricOf('pagesPerSession')).toBe(SessionMetric.AVG_EVENTS_PER_SESSION)
  })
})

describe('breakdown queries', () => {
  it('topk breakdown ranks a property, scoped to page_view', () => {
    const spec = buildTopKBreakdownQuery('$country', AggregationType.UNIQUE_USERS, [], 20).spec!
    expect(spec.insightType).toBe(InsightType.TOP_K)
    expect(spec.topK?.dimension).toBe(TopKQuery_Dimension.PROPERTY)
    expect(spec.topK?.property).toBe('$country')
    expect(spec.topK?.metric).toBe(AggregationType.UNIQUE_USERS)
    expect(spec.topK?.scope?.kind).toBe(WEB_PRIMARY_KIND)
    expect(spec.topK?.limit).toBe(20)
  })

  it('event-kind topk is unscoped and totals', () => {
    const spec = buildEventKindTopKQuery().spec!
    expect(spec.topK?.dimension).toBe(TopKQuery_Dimension.EVENT_KIND)
    expect(spec.topK?.scope).toBeUndefined()
    expect(spec.topK?.metric).toBe(AggregationType.TOTAL)
  })

  it('session entry breakdown is TRENDS with exactly one breakdown', () => {
    const spec = buildSessionBreakdownQuery(SessionMetric.ENTRY, '$url').spec!
    expect(spec.insightType).toBe(InsightType.TRENDS)
    expect(spec.session?.metric).toBe(SessionMetric.ENTRY)
    expect(spec.session?.scope?.kind).toBe(WEB_PRIMARY_KIND)
    expect(spec.breakdowns).toHaveLength(1)
    expect(spec.breakdowns[0].property).toBe('$url')
  })
})

describe('formatWebStatValue', () => {
  it('formats percent from a 0-100 value (no rescale)', () => {
    expect(formatWebStatValue('bounceRate', 42.5)).toBe('42.5%')
  })

  it('formats duration from seconds', () => {
    expect(formatWebStatValue('avgDuration', 45)).toBe('45s')
    expect(formatWebStatValue('avgDuration', 90)).toBe('1m 30s')
    expect(formatWebStatValue('avgDuration', 3661)).toBe('1h 1m')
  })

  it('formats pages/session with one decimal', () => {
    expect(formatWebStatValue('pagesPerSession', 2.345)).toBe('2.3')
  })

  it('compacts large counts', () => {
    expect(formatWebStatValue('users', 1500)).toBe('1.5K')
  })
})
