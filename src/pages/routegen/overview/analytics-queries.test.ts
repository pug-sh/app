import { describe, expect, it } from 'vitest'
import { AggregationType, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { buildBreakdownQuery, buildFunnelQuery, buildTopEventsQuery, buildTrendsQuery } from './analytics-queries'

describe('buildFunnelQuery', () => {
  it('is a FUNNEL over the steps in order', () => {
    const spec = buildFunnelQuery(['page_view', 'signup', 'purchase']).spec
    expect(spec?.insightType).toBe(InsightType.FUNNEL)
    expect(spec?.events.map(step => step.event?.kind)).toEqual(['page_view', 'signup', 'purchase'])
  })
})

describe('buildBreakdownQuery', () => {
  it('counts people per bucket, split by the property', () => {
    const spec = buildBreakdownQuery('page_view', '$os').spec!
    expect(spec.insightType).toBe(InsightType.TRENDS)
    expect(spec.events[0].event?.kind).toBe('page_view')
    expect(spec.events[0].aggregation).toBe(AggregationType.UNIQUE_USERS)
    expect(spec.breakdowns.map(breakdown => breakdown.property)).toEqual(['$os'])
  })

  // A spread of a built message drops it (protobuf-es parks explicit-presence defaults on the
  // prototype), and an undefined limit reads as unlimited rather than 50.
  it('carries a breakdown limit', () => {
    expect(buildBreakdownQuery('page_view', '$utmSource').spec!.breakdownLimit).toBe(50)
  })
})

describe('cookieless visitors on the analytics tiles', () => {
  it('the trends tiles count them', () => {
    expect(buildTrendsQuery('page_view', AggregationType.UNIQUE_USERS).spec?.includeCookieless).toBe(true)
  })

  it('top events counts them', () => {
    expect(buildTopEventsQuery().spec?.includeCookieless).toBe(true)
  })

  // The one place the flag changes an answer: these split UNIQUE_USERS, so without it a wholly
  // cookieless referrer drops off the tile instead of ranking on it.
  it('the breakdown tiles count them', () => {
    expect(buildBreakdownQuery('page_view', '$utmSource').spec?.includeCookieless).toBe(true)
  })

  // The one deliberate exception, so this asserts the absence rather than leaving it to the comment.
  it('the funnel does not, so a rotating id cannot read as a midnight drop-off', () => {
    expect(buildFunnelQuery(['page_view', 'signup']).spec?.includeCookieless).toBe(false)
  })
})
