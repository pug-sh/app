import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { act, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  Granularity,
  InsightType,
  type QueryRequest,
  QueryRequestSchema,
  QueryResponseSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

const WIDTH = 800

// happy-dom reports the container as 0x0, and an unsized chart renders nothing at all.
vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: WIDTH, height: 300 }),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({ query }) }
})

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return { ...actual, projectHeaderAtom: atom({ 'x-project-id': 'p1' }), activeProjectTimezoneAtom: atom('UTC') }
})

const { DashboardInsightContent } = await import('./insight-tile-content')

const DAY = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-02T00:00:00Z') }

const QUERY = create(QueryRequestSchema, {
  spec: {
    insightType: InsightType.TRENDS,
    events: [{ event: { kind: 'crawler_request' }, aggregation: AggregationType.TOTAL }],
    breakdowns: [{ property: '$crawler_category' }],
  },
})

// Two stacked series in one hour, as a crawler chart split by purpose gets them.
const requestsAt = (hour: string) => {
  const time = timestampFromDate(new Date(hour))
  return create(QueryResponseSchema, {
    result: {
      case: 'trends',
      value: {
        series: [
          { eventKind: 'crawler_request', breakdown: { $crawler_category: 'training' }, points: [{ time, value: 14 }] },
          { eventKind: 'crawler_request', breakdown: { $crawler_category: 'search' }, points: [{ time, value: 1 }] },
        ],
      },
    },
  })
}

const barWidths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('g.series-bar rect')).map(rect =>
    Number.parseFloat(rect.getAttribute('width') ?? ''),
  )

const tile = (range: typeof DAY, granularity = Granularity.HOUR, query = QUERY) => (
  <DashboardInsightContent
    query={query}
    defaultTimeRange={undefined}
    timeRangeOverride={range}
    granularityOverride={granularity}
    viewMode={DashboardTileViewMode.BAR_STACKED}
    queryKeyPrefix="test-tile"
    compact
    lightMetrics
  />
)

// The backend drops empty buckets, so without the range the one hour holding data would be the whole axis and
// its bar would take half the plot.
describe('a tile whose data lands in one hour', () => {
  beforeEach(() => {
    query.mockReset().mockImplementation(async () => requestsAt('2026-01-01T07:00:00Z'))
  })

  it("draws it as one of the range's 24 hours", async () => {
    const { container } = render(tile(DAY))

    await waitFor(() => expect(barWidths(container).length).toBeGreaterThan(0))
    for (const width of barWidths(container)) {
      expect(width).toBeGreaterThan(WIDTH / 48)
      expect(width).toBeLessThan(WIDTH / 24)
    }
  })

  // A result stays up while the next one loads. Drawn on the next query's days, it reads as days of nothing.
  it('draws each result on the range and granularity it answers', async () => {
    const { container, rerender } = render(tile(DAY))
    await waitFor(() => expect(barWidths(container).length).toBeGreaterThan(0))
    const hourly = barWidths(container)

    let land: (response: unknown) => void = () => {}
    query.mockImplementation(
      () =>
        new Promise(resolve => {
          land = resolve
        }),
    )
    rerender(tile({ from: new Date('2025-12-26T00:00:00Z'), to: DAY.to }, Granularity.DAY))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
    expect((query.mock.calls[1][0] as QueryRequest).granularity).toBe(Granularity.DAY)
    expect(barWidths(container)).toEqual(hourly)

    await act(async () => land(requestsAt('2026-01-01T00:00:00Z')))
    await waitFor(() => {
      expect(barWidths(container).length).toBeGreaterThan(0)
      expect(Math.min(...barWidths(container))).toBeGreaterThan(WIDTH / 24)
    })
    for (const width of barWidths(container)) expect(width).toBeLessThan(WIDTH / 7)
  })

  // An average's empty hours have no value. Drawn under the next query's count, it would gain 23 zero hours.
  it('keeps a result to the fill rule of the query it answers', async () => {
    const purchases = (aggregation: AggregationType) =>
      create(QueryRequestSchema, {
        spec: {
          insightType: InsightType.TRENDS,
          events: [{ event: { kind: 'purchase' }, aggregation, aggregationProperty: 'amount' }],
        },
      })
    const time = timestampFromDate(new Date('2026-01-01T07:00:00Z'))
    query.mockImplementation(async () =>
      create(QueryResponseSchema, {
        result: { case: 'trends', value: { series: [{ eventKind: 'purchase', points: [{ time, value: 30 }] }] } },
      }),
    )
    const { container, rerender } = render(tile(DAY, Granularity.HOUR, purchases(AggregationType.AVG)))
    await waitFor(() => expect(barWidths(container).length).toBeGreaterThan(0))
    const average = barWidths(container)

    query.mockImplementation(() => new Promise(() => {}))
    rerender(tile(DAY, Granularity.HOUR, purchases(AggregationType.TOTAL)))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
    expect(barWidths(container)).toEqual(average)
  })
})
