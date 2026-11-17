import { create } from '@bufbuild/protobuf'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'

// The modules below import the RPC atoms, and the real ones throw at import without VITE_API_BASE_URL.
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({}) }
})

vi.mock('./crawler-section', () => ({
  CrawlerSection: ({
    hasRequests,
    reportsStatusCodes,
    navName,
  }: {
    hasRequests: boolean
    reportsStatusCodes: boolean
    navName?: string
  }) => <div data-testid="crawlers" data-nav={navName}>{`requests:${hasRequests} statuses:${reportsStatusCodes}`}</div>,
}))
vi.mock('./traffic-breakdown-panel', () => ({ TrafficBreakdownPanel: () => null }))
vi.mock('./traffic-chart-tile', () => ({ TrafficChartTile: () => null }))
vi.mock('./traffic-map-panel', () => ({ TrafficMapPanel: () => null }))
vi.mock('./traffic-stat-tile', () => ({ TrafficStatTile: () => null }))

const TrafficAnalyticsMode = (await import('./traffic-analytics-mode')).default

const renderWith = (kinds: string[], autoKeys: string[] = []) =>
  render(
    <TrafficAnalyticsMode
      schema={create(GetFilterSchemaResponseSchema, {
        events: kinds.map(name => ({ name, count: BigInt(10) })),
        autoPropertyKeys: autoKeys.map(name => ({ name })),
      })}
      selectedStat="users"
      onSelectStat={() => {}}
      globalTimeRange={undefined}
      globalGranularity={undefined}
    />,
  )

const crawlers = () => screen.queryByTestId('crawlers')?.textContent ?? null

describe('where the crawler section shows', () => {
  // An app has no server for crawlers to read, so only a website is pointed at the collector.
  it('offers the setup hint to a website, not an app', () => {
    renderWith(['page_view'])
    expect(crawlers()).toBe('requests:false statuses:false')
  })

  it('leaves an app alone until it reports crawler requests', () => {
    const { unmount } = renderWith(['screen_view'])
    expect(crawlers()).toBeNull()
    unmount()

    renderWith(['screen_view', 'crawler_request'])
    expect(crawlers()).toBe('requests:true statuses:false')
  })

  it('shows reported requests even with no navigation events', () => {
    renderWith(['crawler_request'], ['$status_code'])
    expect(screen.getByText('Traffic analytics needs navigation events')).toBeTruthy()
    expect(crawlers()).toBe('requests:true statuses:true')
  })

  it('shows nothing for a project with neither', () => {
    renderWith(['signup'])
    expect(crawlers()).toBeNull()
  })

  it('counts visits from AI on page views, not on busier app screens', () => {
    render(
      <TrafficAnalyticsMode
        schema={create(GetFilterSchemaResponseSchema, {
          events: [
            { name: 'screen_view', count: BigInt(100) },
            { name: 'page_view', count: BigInt(10) },
            { name: 'crawler_request', count: BigInt(5) },
          ],
        })}
        selectedStat="users"
        onSelectStat={() => {}}
        globalTimeRange={undefined}
        globalGranularity={undefined}
      />,
    )
    expect(screen.getByTestId('crawlers').dataset.nav).toBe('page_view')
  })
})
