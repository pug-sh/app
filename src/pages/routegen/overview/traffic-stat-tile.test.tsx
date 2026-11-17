import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const trends = (points: [number, number][]) => ({
  result: {
    case: 'trends',
    value: {
      series: [
        create(TrendSeriesSchema, {
          points: points.map(([d, value]) => create(DataPointSchema, { time: timestampFromDate(day(d)), value })),
        }),
      ],
    },
  },
})

const pageviews = (range: { from: Date; to: Date }) => (
  <TrafficStatTile
    statId="pageviews"
    nav={{ kind: 'page_view', name: 'page_view' }}
    selected={false}
    onSelect={() => {}}
    range={range}
    granularity={Granularity.DAY}
    filters={[]}
  />
)

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
      req.spec?.insightType === InsightType.TRENDS
        ? trends([
            [1, 5],
            [2, 0],
            [3, 7],
          ])
        : segmentation(req),
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

  // An average of an empty day has no value, so the headline must never read one as zero.
  it("leaves an average's empty days out of its sparkline", async () => {
    query.mockImplementation(async (req: QueryRequest) =>
      req.spec?.insightType === InsightType.TRENDS
        ? trends([
            [1, 52],
            [3, 61],
          ])
        : segmentation(req),
    )
    const { container } = render(
      <TrafficStatTile
        statId="avgDuration"
        nav={{ kind: 'page_view', name: 'page_view' }}
        selected={false}
        onSelect={() => {}}
        range={{ from: day(1), to: day(4) }}
        granularity={Granularity.DAY}
        filters={[]}
      />,
    )
    await waitFor(() => expect(container.querySelector('svg[role="img"]')).toBeTruthy())

    fireEvent.pointerMove(container.querySelector('svg[role="img"]') as SVGSVGElement, { clientX: 100 })
    expect(screen.getByText(/^Jul\s[13]$/)).toBeTruthy()
  })

  it('says when the prior window failed, and retries it', async () => {
    let fail = true
    query.mockImplementation(async (req: QueryRequest) => {
      if (req.spec?.insightType === InsightType.TRENDS) return trends([])
      if (fail && req.timeRange?.from?.seconds !== timestampFromDate(day(1)).seconds) throw new Error('unavailable')
      return segmentation(req)
    })
    render(pageviews({ from: day(1), to: day(4) }))

    expect(await screen.findByText('Failed to load')).toBeTruthy()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText('20.0%')).toBeTruthy())
  })

  it('compares totals from the same range', async () => {
    const total = (value: number) => ({ result: { case: 'segmentation', value: { total: value } } })
    let holdPrior = false
    let landPrior = (_value: number) => {}
    query.mockImplementation(async (req: QueryRequest) => {
      if (req.spec?.insightType === InsightType.TRENDS) return trends([])
      const from = req.timeRange?.from?.seconds
      if (from === timestampFromDate(day(1)).seconds) return total(12)
      if (from === timestampFromDate(day(10)).seconds) return total(100)
      if (!holdPrior) return total(10)
      return new Promise(resolve => {
        landPrior = value => resolve(total(value))
      })
    })
    const { rerender } = render(pageviews({ from: day(1), to: day(4) }))
    await waitFor(() => expect(screen.getByText('20.0%')).toBeTruthy())

    holdPrior = true
    rerender(pageviews({ from: day(10), to: day(13) }))
    await waitFor(() => expect(screen.getByText('100')).toBeTruthy())
    expect(screen.queryByText(/%$/)).toBeNull()

    await act(async () => landPrior(80))
    await waitFor(() => expect(screen.getByText('25.0%')).toBeTruthy())
  })
})
