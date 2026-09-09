import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  DataPointSchema,
  Granularity,
  InsightType,
  TrendSeriesSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

// The RPC atom builds a real ConnectRPC client at read time. The tile fires two queries — the live
// window and the prior one — and the caption only appears once the second lands.
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

// happy-dom reports the container as 0x0, and an unsized chart renders nothing at all.
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 300 }),
}))

const { buildTrafficStatQuery } = await import('./traffic-queries')
const { TrafficChartTile } = await import('./traffic-chart-tile')

const at = (hour: number) => new Date(Date.UTC(2026, 6, 20, hour))

const trends = (values: number[]) => ({
  result: {
    case: 'trends',
    value: {
      series: [
        create(TrendSeriesSchema, {
          eventKind: 'page_view',
          points: values.map((value, i) => create(DataPointSchema, { time: timestampFromDate(at(i)), value })),
        }),
      ],
    },
  },
})

const tile = () => (
  <TrafficChartTile
    statLabel="Visitors"
    navName="page_view"
    query={buildTrafficStatQuery('page_view', 'users', InsightType.TRENDS)}
    range={{ from: at(0), to: at(3) }}
    granularity={Granularity.HOUR}
    queryKeyPrefix="test"
  />
)

// The bug this tile exists to fix: the caption and the "via …" footer were two separate faint lines
// stacked on each other. Only one <p> may carry both, and only while a dashed line is drawn.
describe('TrafficChartTile footer', () => {
  it('names the dashed line on the tile footer once the prior window lands', async () => {
    query.mockResolvedValue(trends([4, 9, 6, 7]))

    const { container } = render(tile())
    expect(screen.getByText('via page_view')).toBeTruthy()

    await waitFor(() => expect(screen.getByText('via page_view · dashed line is the previous period')).toBeTruthy())
    expect(container.querySelectorAll('p.text-faint')).toHaveLength(1)
  })

  it('leaves the footer alone when the prior window has nothing to draw', async () => {
    query.mockResolvedValue(trends([0, 0, 0, 0]))

    render(tile())

    await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
    expect(screen.getByText('via page_view')).toBeTruthy()
  })
})
