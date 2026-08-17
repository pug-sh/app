import { describe, expect, it } from 'vitest'
import { AggregationType, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { buildFunnelQuery, buildTopEventsQuery, buildTrendsQuery } from './analytics-queries'

describe('buildFunnelQuery', () => {
  it('is a FUNNEL over the steps in order', () => {
    const spec = buildFunnelQuery(['page_view', 'signup', 'purchase']).spec
    expect(spec?.insightType).toBe(InsightType.FUNNEL)
    expect(spec?.events.map(step => step.event?.kind)).toEqual(['page_view', 'signup', 'purchase'])
  })
})

describe('cookieless visitors on the analytics tiles', () => {
  it('the trends tiles count them', () => {
    expect(buildTrendsQuery('page_view', AggregationType.UNIQUE_USERS).spec?.includeCookieless).toBe(true)
  })

  it('top events counts them', () => {
    expect(buildTopEventsQuery().spec?.includeCookieless).toBe(true)
  })

  // The one deliberate exception, so this asserts the absence rather than leaving it to the comment.
  it('the funnel does not, so a rotating id cannot read as a midnight drop-off', () => {
    expect(buildFunnelQuery(['page_view', 'signup']).spec?.includeCookieless).toBe(false)
  })
})
