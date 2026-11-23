import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FilterOperator, LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import {
  Granularity,
  InsightType,
  type QueryRequest,
  QueryResponseSchema,
  SessionMetric,
} from '@/api/genproto/shared/insights/v1/insights_pb'

const { query, trackFeature } = vi.hoisted(() => ({ query: vi.fn(), trackFeature: vi.fn() }))

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature,
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 300 }),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({ query }) }
})

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return {
    ...actual,
    projectHeaderAtom: atom({ 'x-project-id': 'p1' }),
    activeProjectTimezoneAtom: atom('UTC'),
  }
})

const { CrawlerSection } = await import('./crawler-section')

const RANGE = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-02T00:00:00Z') }
const at = timestampFromDate(new Date('2026-01-01T07:00:00Z'))

const PURPOSE_TOTALS: Record<string, number> = { answers: 44, search: 154, training: 131, seo: 61 }

const AGENTS = [
  { agent: 'Googlebot', company: 'Google', purpose: 'search', requests: 79 },
  { agent: 'GPTBot', company: 'OpenAI', purpose: 'training', requests: 68 },
  { agent: 'ChatGPT-User', company: 'OpenAI', purpose: 'answers', requests: 30 },
  { agent: 'AhrefsBot', company: '', purpose: 'seo', requests: 41 },
  { agent: 'ClaudeBot', company: 'Anthropic', purpose: 'training', requests: 33 },
]

const requests = () => query.mock.calls.map(([request]) => request as QueryRequest)
const scopeOf = (request: QueryRequest) =>
  request.spec?.topK?.scope ?? request.spec?.events[0]?.event ?? request.spec?.session?.scope
const scopeFilter = (request: QueryRequest, property: string) =>
  scopeOf(request)?.filters.find(filter => filter.property === property)
const scopeValue = (request: QueryRequest, property: string) => scopeFilter(request, property)?.value
const breakdownsOf = (request: QueryRequest) => request.spec?.breakdowns.map(breakdown => breakdown.property) ?? []
const sectionFilters = (request: QueryRequest) =>
  request.spec?.filterGroups.flatMap(group => group.filters.map(filter => [filter.property, filter.value]))

const series = (breakdown: Record<string, string>, value: number) => ({
  eventKind: 'crawler_request',
  breakdown,
  points: [{ time: at, value }],
})
const trends = (list: ReturnType<typeof series>[]) =>
  create(QueryResponseSchema, { result: { case: 'trends', value: { series: list } } })

const respond = (request: QueryRequest) => {
  const spec = request.spec
  if (spec?.insightType === InsightType.SEGMENTATION) {
    const total = spec.session ? 12 : (PURPOSE_TOTALS[scopeValue(request, '$crawler_category') ?? ''] ?? 0)
    return create(QueryResponseSchema, { result: { case: 'segmentation', value: { total } } })
  }
  if (spec?.insightType === InsightType.TOP_K) {
    const rows =
      spec.topK?.property === '$bot_reason'
        ? [{ dimensionValue: 'GPTBot', value: 10 }]
        : [
            { dimensionValue: '/pricing', value: 18 },
            { dimensionValue: '/docs/install', value: 9 },
          ]
    return create(QueryResponseSchema, { result: { case: 'topK', value: { rows } } })
  }
  const by = breakdownsOf(request).join(',')
  if (spec?.session && by === '$referrerDomain')
    return trends([series({ $referrerDomain: 'chatgpt.com' }, 8), series({ $referrerDomain: 'perplexity.ai' }, 4)])
  if (by === '$bot_reason,$crawler_company,$crawler_category')
    return trends(
      AGENTS.map(row =>
        series({ $bot_reason: row.agent, $crawler_company: row.company, $crawler_category: row.purpose }, row.requests),
      ),
    )
  if (by === '$bot_reason,$status_code')
    return trends([
      series({ $bot_reason: 'ClaudeBot', $status_code: '403' }, 30),
      series({ $bot_reason: 'GPTBot', $status_code: '404' }, 3),
    ])
  if (by === '$pathname,$status_code') return trends([series({ $pathname: '/old-page', $status_code: '404' }, 5)])
  return trends([series({}, 44)])
}

// `nav: null` is a project that sends no page views.
const renderSection = ({ hasRequests = true, reportsStatusCodes = true, nav = 'page_view' as string | null } = {}) =>
  render(
    <CrawlerSection
      hasRequests={hasRequests}
      reportsStatusCodes={reportsStatusCodes}
      navName={nav ?? undefined}
      globalTimeRange={RANGE}
      globalGranularity={Granularity.HOUR}
    />,
  )

const crawlerTable = async () => {
  const table = await screen.findByRole('table')
  await within(table).findByText('GPTBot')
  return table
}

const crawlerButton = (name: string, pressed = false) => screen.getByRole('button', { name, pressed })
const tile = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) })

beforeEach(() => {
  trackFeature.mockReset()
  query.mockReset().mockImplementation(async (request: QueryRequest) => respond(request))
})

describe('overview crawler section', () => {
  it('points a site with no crawler requests at the collector, and queries nothing', async () => {
    renderSection({ hasRequests: false })

    expect(screen.getByText('No crawler requests yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Set it up' }).getAttribute('href')).toBe('https://docs.pug.sh/crawlers/')
    // Past the queries' debounce, or a panel mounted beside the hint would still pass.
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(query).not.toHaveBeenCalled()
  })

  // Every crawler request is bot-tagged, so a query without include_bots reads nothing. Visits are people.
  it('asks for crawler requests with bots included, and for visits from AI without them', async () => {
    renderSection()
    await crawlerTable()

    const visits = requests().filter(request => request.spec?.session)
    const crawls = requests().filter(request => !request.spec?.session)
    expect(visits.length).toBeGreaterThan(0)
    for (const request of crawls) {
      expect(request.spec?.includeBots).toBe(true)
      expect(scopeOf(request)?.kind).toBe('crawler_request')
    }
    for (const request of visits) {
      expect(request.spec?.includeBots).toBe(false)
      const [group] = request.spec?.filterGroups ?? []
      expect(group.operator).toBe(LogicalOperator.OR)
      expect(group.filters.map(filter => filter.property)).toEqual(['$channel', '$referrerDomain', '$utmSource'])
    }
  })

  it('counts each purpose and the visits AI sent, and charts the one picked', async () => {
    renderSection()

    for (const [label, value] of [
      ['AI answers', '44'],
      ['Search', '154'],
      ['AI training', '131'],
      ['SEO tools', '61'],
      ['Visits from AI', '12'],
    ]) {
      await waitFor(() => expect(within(tile(label)).getByText(value)).toBeTruthy())
    }
    expect(screen.getByRole('heading', { name: 'AI answers' })).toBeTruthy()
    expect(screen.getByText(/^via crawler_request/)).toBeTruthy()

    fireEvent.click(tile('AI training'))
    expect(screen.getByRole('heading', { name: 'AI training' })).toBeTruthy()
    expect(tile('AI training').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(tile('Visits from AI'))
    expect(screen.getAllByRole('heading', { name: 'Visits from AI' })).toHaveLength(2)
    expect(screen.getByText(/^via page_view/)).toBeTruthy()
  })

  it('charts the visits AI sent when their tile is picked', async () => {
    renderSection()
    await crawlerTable()
    const visitTrends = () =>
      requests().filter(
        request =>
          request.spec?.session && request.spec.insightType === InsightType.TRENDS && !request.spec.breakdowns.length,
      )
    await waitFor(() => expect(visitTrends()).toHaveLength(1))

    fireEvent.click(tile('Visits from AI'))
    // The chart and its prior period.
    await waitFor(() => expect(visitTrends()).toHaveLength(3))
    for (const request of visitTrends().slice(1)) {
      expect(request.spec?.session?.metric).toBe(SessionMetric.SESSIONS)
      expect(request.spec?.includeCookieless).toBe(true)
    }
  })

  it('leaves visits from AI out of a project that sends no page views', async () => {
    renderSection({ nav: null })
    await crawlerTable()

    expect(screen.queryByText('Visits from AI')).toBeNull()
    expect(requests().some(request => request.spec?.session)).toBe(false)
  })

  it('lists who reads the site by company, busiest first, with each logo', async () => {
    renderSection()
    const table = await crawlerTable()

    const rows = within(table).getAllByRole('row').slice(1) as HTMLTableRowElement[]
    expect(rows.map(row => [row.cells[0].textContent, row.cells[1].textContent, row.cells[2].textContent])).toEqual([
      ['OpenAI', 'GPTBot', 'AI training'],
      ['', 'ChatGPT-User', 'AI answers'],
      ['Google', 'Googlebot', 'Search'],
      ['Ahrefs', 'AhrefsBot', 'SEO tools'],
      ['Anthropic', 'ClaudeBot', 'AI training'],
    ])
    expect(Array.from(table.querySelectorAll('img')).map(img => img.getAttribute('src'))).toEqual([
      'https://favicons.pug.sh/openai.com',
      'https://favicons.pug.sh/google.com',
      'https://favicons.pug.sh/ahrefs.com',
      'https://favicons.pug.sh/anthropic.com',
    ])
    expect(rows[0].cells[5].textContent).toMatch(/^Jan\s1,\s07:00$/)
  })

  it('says which crawlers got errors, and what kind', async () => {
    renderSection()
    const table = await crawlerTable()

    await waitFor(() => expect(within(table).getByText('30 refused')).toBeTruthy())
    expect(within(table).getByText('3 not found')).toBeTruthy()
    const errors = requests().filter(request => breakdownsOf(request).join() === '$bot_reason,$status_code')
    expect(errors.map(request => scopeFilter(request, '$status_code'))).toMatchObject([
      { operator: FilterOperator.GTE, value: '400' },
    ])
  })

  it('leaves errors unknown when no status codes are reported', async () => {
    renderSection({ reportsStatusCodes: false })
    const table = await crawlerTable()

    expect(within(table).getAllByText('–')).toHaveLength(AGENTS.length)
    expect(within(table).queryByText('30 refused')).toBeNull()
    expect(screen.getByText(/· no status codes reported$/)).toBeTruthy()
  })

  it('says when errors could not be loaded, and retries them', async () => {
    let fail = true
    query.mockImplementation(async (request: QueryRequest) => {
      if (fail && breakdownsOf(request).join() === '$bot_reason,$status_code') throw new Error('unavailable')
      return respond(request)
    })
    renderSection()
    const table = await crawlerTable()

    expect(await screen.findByText(/Couldn't load error counts/)).toBeTruthy()
    expect(within(table).getAllByText('–')).toHaveLength(AGENTS.length)
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(within(table).getByText('30 refused')).toBeTruthy())
    expect(screen.queryByText(/Couldn't load error counts/)).toBeNull()
  })

  // Past the query's limit, a crawler with nothing listed may still have errors in the overflow.
  it('leaves errors unknown for crawlers the error limit may have cut', async () => {
    query.mockImplementation(async (request: QueryRequest) => {
      if (breakdownsOf(request).join() !== '$bot_reason,$status_code') return respond(request)
      return trends([
        series({ $bot_reason: 'ClaudeBot', $status_code: '403' }, 30),
        series({ $bot_reason: '$others', $status_code: '$others' }, 9),
      ])
    })
    renderSection()
    const table = await crawlerTable()

    await waitFor(() => expect(within(table).getByText('30 refused')).toBeTruthy())
    expect(within(table).getAllByText('–')).toHaveLength(AGENTS.length - 1)
  })

  // ClaudeBot's 403s are listed under its own name, while it's counted in the other crawlers' row.
  it('leaves errors unknown for other crawlers', async () => {
    query.mockImplementation(async (request: QueryRequest) => {
      if (breakdownsOf(request).join() !== '$bot_reason,$crawler_company,$crawler_category') return respond(request)
      return trends([
        series({ $bot_reason: 'GPTBot', $crawler_company: 'OpenAI', $crawler_category: 'training' }, 68),
        series({ $bot_reason: '$others', $crawler_company: '$others', $crawler_category: '$others' }, 33),
      ])
    })
    renderSection()
    const table = await crawlerTable()

    await waitFor(() => expect(within(table).getByText('3 not found')).toBeTruthy())
    const others = within(table).getByText('Other crawlers').closest('tr') as HTMLTableRowElement
    expect(others.cells[6].textContent).toBe('–')
  })

  // A crawler recategorized inside the range comes back as one series per purpose.
  it('keeps a crawler that changed purpose on two rows', async () => {
    const keyWarnings = vi.spyOn(console, 'error')
    query.mockImplementation(async (request: QueryRequest) => {
      if (breakdownsOf(request).join() !== '$bot_reason,$crawler_company,$crawler_category') return respond(request)
      return trends([
        series({ $bot_reason: 'GPTBot', $crawler_company: 'OpenAI', $crawler_category: 'training' }, 40),
        series({ $bot_reason: 'GPTBot', $crawler_company: 'OpenAI', $crawler_category: 'answers' }, 5),
      ])
    })
    renderSection()
    const table = await screen.findByRole('table')

    await waitFor(() => expect(within(table).getAllByRole('button', { name: 'GPTBot' })).toHaveLength(2))
    expect(keyWarnings.mock.calls.some(call => String(call[0]).includes('same key'))).toBe(false)
  })

  // A collector behind a CDN reports the CDN's address, which fails every check a crawler gets.
  it('says when every request from a crawler failed its check', async () => {
    query.mockImplementation(async (request: QueryRequest) => {
      if (request.spec?.topK?.property !== '$bot_reason') return respond(request)
      const rows = [{ dimensionValue: 'GPTBot', value: 68 }]
      return create(QueryResponseSchema, { result: { case: 'topK', value: { rows } } })
    })
    renderSection()
    await crawlerTable()

    expect(await screen.findByText(/^Every GPTBot request failed OpenAI's IP check/)).toBeTruthy()
  })

  it('warns about requests that only claimed to be a crawler', async () => {
    renderSection()
    await crawlerTable()

    expect(await screen.findByText("10 requests claimed to be GPTBot but failed OpenAI's IP check")).toBeTruthy()
    const impostors = requests().filter(request => request.spec?.topK?.property === '$bot_reason')
    expect(impostors.map(request => scopeFilter(request, '$crawler_verified'))).toMatchObject([
      { operator: FilterOperator.EQUALS, value: 'failed' },
    ])
  })

  it('filters the rest of the section by a clicked crawler', async () => {
    renderSection()
    await crawlerTable()
    const before = requests().length

    fireEvent.click(crawlerButton('GPTBot'))

    await screen.findByTitle('Remove filter')
    await waitFor(() => expect(requests().length).toBeGreaterThan(before))
    const after = requests().slice(before)
    const pages = after.filter(request => request.spec?.topK?.property === '$pathname')
    expect(pages.length).toBeGreaterThan(0)
    for (const request of pages) expect(sectionFilters(request)).toEqual([['$bot_reason', 'GPTBot']])
    // Four purpose tiles and their prior periods, then their four sparklines, the chart and its prior period.
    const narrowed = (type: InsightType) =>
      requests()
        .slice(before)
        .filter(
          request => request.spec?.insightType === type && !request.spec.session && !request.spec.breakdowns.length,
        )
        .filter(request => sectionFilters(request)?.join() === '$bot_reason,GPTBot')
    await waitFor(() => expect(narrowed(InsightType.SEGMENTATION)).toHaveLength(8))
    await waitFor(() => expect(narrowed(InsightType.TRENDS)).toHaveLength(6))
    // The table keeps every crawler, so the pick can be changed or toggled off; people aren't crawlers.
    expect(after.some(request => breakdownsOf(request).includes('$crawler_company'))).toBe(false)
    expect(after.some(request => request.spec?.session)).toBe(false)
    expect(trackFeature).toHaveBeenCalledWith(expect.objectContaining({ featureId: 'overview.crawlers.filter' }))
  })

  it('clears a crawler by clicking it again or from its chip', async () => {
    renderSection()
    await crawlerTable()

    fireEvent.click(crawlerButton('GPTBot'))
    await screen.findByTitle('Remove filter')
    fireEvent.click(crawlerButton('GPTBot', true))
    await waitFor(() => expect(screen.queryByTitle('Remove filter')).toBeNull())

    fireEvent.click(crawlerButton('GPTBot'))
    fireEvent.click(await screen.findByTitle('Remove filter'))
    await waitFor(() => expect(screen.queryByTitle('Remove filter')).toBeNull())
    expect(crawlerButton('GPTBot')).toBeTruthy()
  })

  it('shows the error each page got', async () => {
    renderSection()
    await screen.findByText('/pricing')

    fireEvent.click(screen.getByRole('button', { name: 'Problems' }))
    expect(await screen.findByText('/old-page')).toBeTruthy()
    expect(screen.getByText('404')).toBeTruthy()
    const problems = requests().filter(request => breakdownsOf(request).join() === '$pathname,$status_code')
    expect(problems.map(request => scopeFilter(request, '$status_code'))).toMatchObject([
      { operator: FilterOperator.GTE, value: '400' },
    ])
  })

  it('names a problem with no page, and the overflow, as the other tabs do, and files neither as a filter', async () => {
    query.mockImplementation(async (request: QueryRequest) => {
      if (breakdownsOf(request).join() !== '$pathname,$status_code') return respond(request)
      return trends([
        series({ $pathname: '/old-page', $status_code: '404' }, 5),
        series({ $pathname: '', $status_code: '500' }, 2),
        series({ $pathname: '$others', $status_code: '$others' }, 1),
      ])
    })
    renderSection()
    await screen.findByText('/pricing')

    fireEvent.click(screen.getByRole('button', { name: 'Problems' }))
    expect(await screen.findByRole('button', { name: /\/old-page/ })).toBeTruthy()
    expect(screen.getByText('(not set)')).toBeTruthy()
    expect(screen.getByText('(others)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /\(not set\)|\(others\)/ })).toBeNull()
  })

  it('names AI visits that sent no referrer as such', async () => {
    query.mockImplementation(async (request: QueryRequest) => {
      if (!request.spec?.session || breakdownsOf(request).join() !== '$referrerDomain') return respond(request)
      return trends([series({ $referrerDomain: 'chatgpt.com' }, 8), series({ $referrerDomain: '' }, 3)])
    })
    renderSection()

    expect(await screen.findByText('(no referrer)')).toBeTruthy()
  })

  it('scopes the page tabs to what each crawler came for', async () => {
    renderSection()
    await screen.findByText('/pricing')

    fireEvent.click(screen.getByRole('button', { name: 'Answered from' }))
    await waitFor(() =>
      expect(
        requests().some(
          request =>
            request.spec?.topK?.property === '$pathname' && scopeValue(request, '$crawler_category') === 'answers',
        ),
      ).toBe(true),
    )
  })

  // A result stays up while the next loads, so a tab's rows would otherwise sit under the next tab until it lands.
  it("drops the previous tab's pages while the next tab's are in flight", async () => {
    renderSection()
    await screen.findByText('/pricing')

    let land!: () => void
    query.mockImplementation(async (request: QueryRequest) => {
      if (scopeValue(request, '$crawler_category') === 'answers' && request.spec?.topK) {
        await new Promise<void>(resolve => (land = resolve))
      }
      return respond(request)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Answered from' }))

    await waitFor(() => expect(land).toBeTypeOf('function'))
    expect(screen.queryByText('/pricing')).toBeNull()
    land()
    expect(await screen.findByText('/pricing')).toBeTruthy()
  })

  // A Next.js proxy runs before the page, so its reports never carry a status: "No data" would read as no errors.
  it('says why there are no errors when no status codes are reported', async () => {
    renderSection({ reportsStatusCodes: false })
    await screen.findByText('/pricing')

    fireEvent.click(screen.getByRole('button', { name: 'Problems' }))
    expect(await screen.findByText(/No status codes reported/)).toBeTruthy()
    expect(screen.queryByText('No data')).toBeNull()
  })

  it('shows which AI products sent visits, with their logos', async () => {
    renderSection()

    const chatgpt = await screen.findByText('chatgpt.com')
    expect(screen.getByText('perplexity.ai')).toBeTruthy()
    const row = chatgpt.closest('div') as HTMLElement
    expect(row.querySelector('img')?.getAttribute('src')).toBe('https://favicons.pug.sh/chatgpt.com')
  })
})
