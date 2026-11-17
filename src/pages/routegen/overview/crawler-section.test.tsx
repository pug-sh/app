import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Granularity, type QueryRequest, QueryResponseSchema } from '@/api/genproto/shared/insights/v1/insights_pb'

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

const ROWS: Record<string, string> = { $bot_reason: 'GPTBot', $pathname: '/pricing', $crawler_category: 'training' }

const requests = () => query.mock.calls.map(([request]) => request as QueryRequest)
const topKCalls = (property: string) => requests().filter(request => request.spec?.topK?.property === property)
const trendCalls = () => requests().filter(request => (request.spec?.events.length ?? 0) > 0)
const filtersOf = (request: QueryRequest) =>
  request.spec?.filterGroups.flatMap(group => group.filters.map(filter => [filter.property, filter.value]))

// The label shows on its ranked row and, once selected, on the filter chip too.
const rowButton = (label: string) =>
  screen
    .getAllByText(label)
    .map(element => element.closest('button'))
    .find(button => button?.title !== 'Remove filter') as HTMLButtonElement

const renderSection = (hasRequests: boolean, reportsStatusCodes = true) =>
  render(
    <CrawlerSection
      hasRequests={hasRequests}
      reportsStatusCodes={reportsStatusCodes}
      globalTimeRange={RANGE}
      globalGranularity={Granularity.HOUR}
    />,
  )

beforeEach(() => {
  trackFeature.mockReset()
  query.mockReset().mockImplementation(async (request: QueryRequest) => {
    const property = request.spec?.topK?.property
    if (!property) return create(QueryResponseSchema, {})
    const label = ROWS[property] ?? 'other'
    return create(QueryResponseSchema, {
      result: { case: 'topK', value: { rows: [{ dimensionValue: label, value: 7 }] } },
    })
  })
})

describe('overview crawler section', () => {
  it('points a site with no crawler requests at the collector, and queries nothing', async () => {
    renderSection(false)

    expect(screen.getByText('No crawler requests yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Set it up' }).getAttribute('href')).toBe('https://docs.pug.sh/crawlers/')
    // Past the queries' debounce, or a panel mounted beside the hint would still pass.
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(query).not.toHaveBeenCalled()
  })

  // Every crawler request is bot-tagged, so a query without include_bots reads nothing.
  it('asks for crawler requests with bots included', async () => {
    renderSection(true)

    await screen.findByText('GPTBot')
    for (const [request] of query.mock.calls as [QueryRequest][]) {
      expect(request.spec?.includeBots).toBe(true)
      const kind = request.spec?.topK?.scope?.kind ?? request.spec?.events[0]?.event?.kind
      expect(kind).toBe('crawler_request')
    }
  })

  it('scopes the not found tab to 404 responses', async () => {
    renderSection(true)
    await screen.findByText('/pricing')

    fireEvent.click(screen.getByRole('button', { name: 'Not found' }))
    await waitFor(() => expect(topKCalls('$pathname')).toHaveLength(2))

    const filters = topKCalls('$pathname')[1].spec?.topK?.scope?.filters
    expect(filters?.map(filter => [filter.property, filter.value])).toEqual([['$status_code', '404']])
  })

  // A Next.js proxy runs before the page, so its reports never carry a status: "No data" would read as no 404s.
  it('says why there are no 404s when no status codes are reported', async () => {
    renderSection(true, false)
    await screen.findByText('/pricing')

    fireEvent.click(screen.getByRole('button', { name: 'Not found' }))
    expect(await screen.findByText(/No status codes reported/)).toBeTruthy()
    expect(screen.queryByText('No data')).toBeNull()
  })

  it('filters the rest of the section by a clicked crawler', async () => {
    renderSection(true)
    fireEvent.click(await screen.findByText('GPTBot'))

    await waitFor(() => expect(topKCalls('$pathname')).toHaveLength(2))
    expect(filtersOf(topKCalls('$pathname')[1])).toEqual([['$bot_reason', 'GPTBot']])
    await waitFor(() => expect(filtersOf(trendCalls()[trendCalls().length - 1])).toEqual([['$bot_reason', 'GPTBot']]))
    // The crawler's own panel stays unfiltered, so every crawler can still be picked or toggled off.
    expect(topKCalls('$bot_reason').every(request => filtersOf(request)?.length === 0)).toBe(true)
    expect(screen.getByText('Crawler')).toBeTruthy()
    expect(trackFeature).toHaveBeenCalledWith(expect.objectContaining({ featureId: 'overview.crawlers.filter' }))
  })

  it('clears a crawler by clicking it again or from its chip', async () => {
    renderSection(true)
    fireEvent.click(await screen.findByText('GPTBot'))
    await screen.findByText('Crawler')

    fireEvent.click(rowButton('GPTBot'))
    await waitFor(() => expect(screen.queryByText('Crawler')).toBeNull())

    fireEvent.click(rowButton('GPTBot'))
    fireEvent.click(await screen.findByTitle('Remove filter'))
    await waitFor(() => expect(screen.queryByText('Crawler')).toBeNull())
  })

  it('names category codes', async () => {
    renderSection(true)
    await screen.findByText('GPTBot')

    fireEvent.click(screen.getByRole('button', { name: 'Categories' }))
    expect(await screen.findByText('AI training')).toBeTruthy()
  })
})
