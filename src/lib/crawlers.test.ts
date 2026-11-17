import { describe, expect, it } from 'vitest'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { crawlerOf, isCrawlerId, readsBotOnlyData, specReadsBotOnlyData } from './crawlers'

const scope = (kind: string, property?: string) => ({
  kind,
  filters: property ? [{ property, operator: FilterOperator.EQUALS, value: 'x' }] : [],
})

describe('specReadsBotOnlyData', () => {
  // Each insight type puts its event somewhere else, so one slot passing says nothing about the rest.
  it.each([
    ['an event row', { events: [{ event: scope('crawler_request') }] }],
    ['a top-K scope', { topK: { scope: scope('crawler_request') } }],
    ['a map scope', { map: { scope: scope('crawler_request') } }],
    ['a user-flow scope', { userFlow: { scope: scope('crawler_request') } }],
    ['a session scope', { session: { scope: scope('crawler_request') } }],
  ])('sees crawler_request in %s', (_, spec) => {
    expect(specReadsBotOnlyData(spec)).toBe(true)
  })

  it.each([
    ['a breakdown', { breakdowns: [{ property: '$crawler_category' }] }],
    ['a top-K dimension', { topK: { property: '$bot_reason' } }],
    ['a user-flow node', { userFlow: { nodeProperty: '$crawler_company' } }],
    [
      'a global filter',
      { filterGroups: [{ filters: [{ property: '$crawler_verified', operator: FilterOperator.IS_SET }] }] },
    ],
    ['an event row filter', { events: [{ event: scope('page_view', '$crawler_category') }] }],
  ])('sees a crawler property in %s', (_, spec) => {
    expect(specReadsBotOnlyData(spec)).toBe(true)
  })

  it('sees the bot flag itself', () => {
    const flag = { property: '$bot', operator: FilterOperator.EQUALS, value: 'true' }
    expect(specReadsBotOnlyData({ filterGroups: [{ filters: [flag] }] })).toBe(true)
    expect(specReadsBotOnlyData({ breakdowns: [{ property: '$bot' }] })).toBe(true)
  })

  // A negation also matches every row without the property, which is mostly people.
  it('leaves a negated filter on a bot-only property alone', () => {
    const negations = [
      { property: '$crawler_category', operator: FilterOperator.IS_NOT_SET },
      { property: '$bot_reason', operator: FilterOperator.NOT_EQUALS, value: 'GPTBot' },
      { property: '$crawler_company', operator: FilterOperator.NOT_IN, values: ['OpenAI'] },
      { property: '$crawler_verified', operator: FilterOperator.NOT_CONTAINS, value: 'fail' },
      { property: '$bot', operator: FilterOperator.IS_NOT_SET },
    ]
    expect(specReadsBotOnlyData({ events: [{ event: { kind: 'page_view', filters: negations } }] })).toBe(false)
    expect(specReadsBotOnlyData({ filterGroups: [{ filters: negations }] })).toBe(false)
  })

  it('leaves an ordinary query alone', () => {
    expect(
      specReadsBotOnlyData({
        events: [{ event: scope('page_view', '$country') }],
        breakdowns: [{ property: '$browser' }],
        filterGroups: [{ filters: [{ property: 'crawler_note', operator: FilterOperator.IS_SET }] }],
      }),
    ).toBe(false)
    expect(specReadsBotOnlyData({})).toBe(false)
  })
})

describe('readsBotOnlyData', () => {
  it('reads kinds and filters as the explorer holds them', () => {
    const filter = (property: string, operator: FilterOperator) => ({ property, operator })
    expect(readsBotOnlyData(['page_view', 'crawler_request'], [])).toBe(true)
    expect(readsBotOnlyData([''], [filter('$bot_reason', FilterOperator.EQUALS)])).toBe(true)
    expect(readsBotOnlyData(['page_view'], [filter('$pathname', FilterOperator.EQUALS)])).toBe(false)
    expect(readsBotOnlyData(['page_view'], [filter('$bot_reason', FilterOperator.IS_NOT_SET)])).toBe(false)
  })
})

describe('crawler identity', () => {
  it('reads the agent off a crawler request', () => {
    expect(
      crawlerOf({
        $bot_reason: 'GPTBot',
        $crawler_company: 'OpenAI',
        $crawler_category: 'training',
        $crawler_verified: 'verified',
      }),
    ).toEqual({ name: 'GPTBot', company: 'OpenAI', category: 'training', verified: 'verified' })
  })

  it('leaves what the request lacks unset', () => {
    expect(crawlerOf({ $bot_reason: 'AhrefsBot', $crawler_category: 'seo' })).toEqual({
      name: 'AhrefsBot',
      company: undefined,
      category: 'seo',
      verified: undefined,
    })
    expect(crawlerOf(undefined).name).toBe('Crawler')
  })

  it('knows the reserved id prefix', () => {
    expect(isCrawlerId('crawler-gptbot')).toBe(true)
    expect(isCrawlerId('cookieless-abc')).toBe(false)
    expect(isCrawlerId('user-crawler-1')).toBe(false)
  })
})
