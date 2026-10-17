import { render } from '@testing-library/react'
import { type ReactNode, useLayoutEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { StaticChartPreviewProvider } from '@/components/charts/static-chart-preview-context'
import type { SeriesColor } from '@/lib/event-colors'
import { AreaChart } from './area-chart'
import { BarChart } from './bar-chart'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

// happy-dom reports the container as 0x0, and a chart with no size renders no SVG at all.
vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

const DATA: ChartPoint[] = [
  { date: new Date('2026-07-19T00:00:00Z'), values: [1] },
  { date: new Date('2026-07-20T00:00:00Z'), values: [5] },
  { date: new Date('2026-07-21T00:00:00Z'), values: [3] },
]

const chartRoot = () => document.querySelector('svg')?.closest('div.relative')

// A later sibling's layout effect reads the chart's first commit, which the browser can paint before the
// shell's effects start the reveal.
const FirstCommit = ({ seen }: { seen: { hidden?: boolean } }) => {
  useLayoutEffect(() => {
    seen.hidden = chartRoot()?.classList.contains('invisible')
  }, [seen])
  return null
}

describe('vendored chart reveal', () => {
  for (const [name, Chart] of [
    ['line', LineChart],
    ['area', AreaChart],
    ['bar', BarChart],
  ] as const) {
    it(`${name}: hides the finished first frame, then shows the reveal`, () => {
      const seen: { hidden?: boolean } = {}
      render(
        <>
          <Chart data={DATA} granularity={Granularity.DAY} seriesColors={COLORS} seriesNames={['a']} timeZone="UTC" />
          <FirstCommit seen={seen} />
        </>,
      )

      expect(seen.hidden).toBe(true)
      expect(chartRoot()?.classList.contains('invisible')).toBe(false)
    })

    it(`${name}: shows a chart whose shell never runs the reveal`, () => {
      render(
        <StaticChartPreviewProvider>
          <Chart data={DATA} granularity={Granularity.DAY} seriesColors={COLORS} seriesNames={['a']} timeZone="UTC" />
        </StaticChartPreviewProvider>,
      )

      expect(chartRoot()?.classList.contains('invisible')).toBe(false)
    })
  }
})
