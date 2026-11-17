import { create } from '@bufbuild/protobuf'
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { RenderedTileSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { SharedDashboardsServiceQueryResponseSchema } from '@/api/genproto/public/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  Granularity,
  InsightType,
  QueryResponseSchema,
  TrendsResultSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { inZoneAsync } from '@/test/timezone'
import SharedDashboard from './shared-dashboard'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    sharedDashboardsRPCAtom: atom({ query }),
    orgsRPCAtom: atom({}),
    projectsRPCAtom: atom({}),
    insightsRPCAtom: atom({}),
  }
})

// happy-dom reports the container as 0x0, and an unsized chart renders nothing at all.
vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 300 }),
}))

// Two Asia/Kolkata days as the server buckets them, at IST midnight (18:30 UTC the day before).
const istDay = (day: number) => timestampFromDate(new Date(Date.UTC(2026, 10, day - 1, 18, 30)))

const tile = create(RenderedTileSchema, {
  tile: {
    id: 'meta',
    displayName: 'Meta-attributed Traffic',
    content: {
      case: 'insight',
      value: {
        spec: {
          insightType: InsightType.TRENDS,
          events: [{ event: { kind: 'page_view' }, aggregation: AggregationType.UNIQUE_USERS }],
        },
      },
    },
  },
  outcome: {
    case: 'result',
    value: create(QueryResponseSchema, {
      result: {
        case: 'trends',
        value: create(TrendsResultSchema, {
          series: [
            {
              eventKind: 'page_view',
              points: [
                { time: istDay(11), value: 4 },
                { time: istDay(12), value: 8 },
              ],
            },
          ],
        }),
      },
    }),
  },
})

const response = create(SharedDashboardsServiceQueryResponseSchema, {
  dashboard: { id: 'traffic', displayName: 'Traffic', defaultGranularity: Granularity.DAY, tiles: [tile] },
  reportingTimezone: 'Asia/Kolkata',
})

afterEach(() => vi.useRealTimers())

// The tile's own axis: a picked range puts its days on the picker's chip too.
const tileDays = () =>
  within(screen.getByText('Meta-attributed Traffic').closest('.group') as HTMLElement)
    .queryAllByText(/^[A-Z][a-z]{2} \d{1,2}$/)
    .map(day => day.textContent)

const mount = () =>
  render(
    <Provider store={createStore()}>
      <Router hook={memoryLocation({ path: '/shared/share-1' }).hook}>
        <Route path="/shared/:shareId">
          <SharedDashboard />
        </Route>
      </Router>
    </Provider>,
  )

// A public viewer has no project to read the zone from. Stepped in UTC, the grid slots a zero at UTC
// midnight between these IST days, so the floor reads 0, not 4, and the labels land a day early.
it("steps and labels a shared dashboard's days in the zone its response names", async () => {
  query.mockResolvedValue(response)
  // Not the project's zone, so a tile reading the viewer's own zone can't pass for the project's.
  await inZoneAsync('America/Los_Angeles', async () => {
    const { container } = await act(async () => mount())
    await waitFor(() => expect(container.textContent).toContain('Nov 12'))
    expect(container.textContent).toContain('floor4')
  })
  expect(query).toHaveBeenCalledWith(expect.objectContaining({ shareId: 'share-1' }), expect.anything())
})

// The picker's presets start at the viewer's midnight, mid-day in IST for a Los Angeles viewer, and the
// server takes a picked range as sent: unfloored, the first IST day comes back partial and dips.
it("floors a picked range to the start of the share's day", async () => {
  query.mockResolvedValue(response)
  await inZoneAsync('America/Los_Angeles', async () => {
    await act(async () => mount())
    fireEvent.click(await screen.findByText('time'))
    fireEvent.click(screen.getByText('Last 7 days'))
    await waitFor(() => expect(query.mock.lastCall?.[0].timeRange).toBeDefined())
  })
  const from = timestampDate(query.mock.lastCall?.[0].timeRange.from)
  const istClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
  expect(istClock.format(from)).toBe('00:00')
})

// The days stay up while a new granularity loads. Stepped by the pick, they'd read as hours before any hour arrives.
it('draws a result at the granularity it answers', async () => {
  query.mockResolvedValue(response)
  const { container } = await act(async () => mount())
  await waitFor(() => expect(container.textContent).toContain('Nov 12'))
  const days = tileDays()

  query.mockImplementation(() => new Promise(() => {}))
  fireEvent.click(screen.getByText('granularity'))
  fireEvent.click(screen.getByRole('button', { name: 'Hour' }))
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
  expect(tileDays()).toEqual(days)
})

// A count's quiet days are real zeros, so a picked range draws the days its data doesn't reach.
it('fills a count out to the range the viewer picked', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 14, 12)))
  query.mockResolvedValue(response)
  const { container } = await act(async () => mount())
  await waitFor(() => expect(container.textContent).toContain('Nov 12'))
  expect(tileDays()).toHaveLength(2)

  fireEvent.click(await screen.findByText('time'))
  fireEvent.click(screen.getByText('Last 7 days'))
  await waitFor(() => expect(tileDays().length).toBeGreaterThan(2))
})
