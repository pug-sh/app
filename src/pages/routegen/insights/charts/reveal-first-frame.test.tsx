import { render, waitFor } from '@testing-library/react'
import { type ReactNode, useLayoutEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { AreaChart } from './area-chart'
import { BarChart } from './bar-chart'
import { CHART_MARGIN } from './common'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

const WIDTH = 800
const INNER_WIDTH = WIDTH - CHART_MARGIN.left - CHART_MARGIN.right

// happy-dom reports the container as 0x0, and a chart with no size renders no SVG at all.
vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: WIDTH, height: 400 }),
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

const DATA: ChartPoint[] = [
  { date: new Date('2026-07-19T00:00:00Z'), values: [1] },
  { date: new Date('2026-07-20T00:00:00Z'), values: [5] },
  { date: new Date('2026-07-21T00:00:00Z'), values: [3] },
]

const revealWidth = () =>
  Number.parseFloat(
    document.querySelector('svg > defs > clipPath[id*="grow-clip"] > rect')?.getAttribute('width') ?? '',
  )

// A later sibling's layout effect reads the chart's first commit, which the browser can paint before any useEffect runs.
const FirstCommit = ({ seen }: { seen: { width?: number } }) => {
  useLayoutEffect(() => {
    seen.width = revealWidth()
  }, [seen])
  return null
}

describe('vendored chart reveal', () => {
  for (const [name, Chart] of [
    ['line', LineChart],
    ['area', AreaChart],
    ['bar', BarChart],
  ] as const) {
    it(`${name}: clips the series away in its first frame, then reveals it`, async () => {
      const seen: { width?: number } = {}
      render(
        <>
          <Chart data={DATA} granularity={Granularity.DAY} seriesColors={COLORS} seriesNames={['a']} timeZone="UTC" />
          <FirstCommit seen={seen} />
        </>,
      )

      expect(seen.width).toBe(0)
      await waitFor(() => expect(revealWidth()).toBeGreaterThanOrEqual(INNER_WIDTH), { timeout: 3000 })
    })
  }
})
