import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  DataPointSchema,
  Granularity,
  InsightType,
  type QueryRequest,
  TrendSeriesSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({ query }) }
})

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return { ...actual, projectHeaderAtom: atom({ 'x-project-id': 'p1' }), activeProjectTimezoneAtom: atom('UTC') }
})

// happy-dom reports the container as 0x0, and an unsized chart renders nothing at all.
vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 200, height: 40 }),
}))

const { TrafficStatTile } = await import('./traffic-stat-tile')

const day = (d: number) => new Date(Date.UTC(2026, 6, d))

const trends = (values: number[]) => ({
  result: {
    case: 'trends',
    value: {
      series: [
        create(TrendSeriesSchema, {
          points: values.map((value, i) => create(DataPointSchema, { time: timestampFromDate(day(i + 1)), value })),
        }),
      ],
    },
  },
})

// Only the live window starts on day 1, so the delta reads 12 against the prior window's 10.
const segmentation = (req: QueryRequest) => ({
  result: {
    case: 'segmentation',
    value: { total: req.timeRange?.from?.seconds === timestampFromDate(day(1)).seconds ? 12 : 10 },
  },
})

describe('TrafficStatTile', () => {
  it('reads a hovered zero bucket into the headline in place of the delta', async () => {
    query.mockImplementation(async (req: QueryRequest) =>
      req.spec?.insightType === InsightType.TRENDS ? trends([5, 0, 7]) : segmentation(req),
    )
    const { container } = render(
      <TrafficStatTile
        statId="pageviews"
        nav={{ kind: 'page_view', name: 'page_view' }}
        selected={false}
        onSelect={() => {}}
        range={{ from: day(1), to: day(4) }}
        granularity={Granularity.DAY}
        filters={[]}
      />,
    )
    await waitFor(() => expect(screen.getByText('20.0%')).toBeTruthy())
    await waitFor(() => expect(container.querySelector('svg[role="img"]')).toBeTruthy())
    expect(screen.queryByRole('img')).toBeNull()
    const sparkline = container.querySelector('svg[role="img"]') as SVGSVGElement

    fireEvent.pointerMove(sparkline, { clientX: 100 })
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText(/^Jul\s2$/)).toBeTruthy()
    expect(screen.queryByText('20.0%')).toBeNull()

    fireEvent.pointerLeave(sparkline)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('20.0%')).toBeTruthy()
  })
})
