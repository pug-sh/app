import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { type ChartContextValue, ChartProvider } from '@/components/charts/chart-context'
import type { SeriesColor } from '@/lib/event-colors'
import { AreaChart } from './area-chart'
import { BarChart } from './bar-chart'
import { CHART_MARGIN, Y_AXIS_GAP } from './common'
import { ChartTooltip } from './date-labels'
import { AXIS_LABEL_PX_PER_CHAR } from './helpers'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

const WIDTH = 800
const HEIGHT = 400

// happy-dom reports the container as 0x0, and an unsized chart renders nothing to measure.
vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: WIDTH, height: HEIGHT }),
}))

// Stands in for upstream's tooltip, drawing its date pill only when asked to, so a second pill shows up here.
vi.mock('@/components/charts/tooltip', () => ({
  ChartTooltip: ({ showDatePill = true }: { showDatePill?: boolean }) =>
    showDatePill ? <div data-upstream-pill /> : null,
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

// Spans two days, so every hour label carries the day and is the widest the axis draws.
const HOURLY: ChartPoint[] = Array.from({ length: 25 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 6, 19, 12 + i)),
  values: [i],
}))

const CHARTS = [
  ['line', LineChart],
  ['area', AreaChart],
  ['bar', BarChart],
] as const

const renderChart = (Chart: (typeof CHARTS)[number][1]) =>
  render(
    <Chart
      data={HOURLY}
      seriesNames={['page_view']}
      seriesColors={COLORS}
      granularity={Granularity.HOUR}
      timeZone="UTC"
    />,
  )

const xAxisLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('div[style*="bottom: 12px"]'))
    .map(el => ({ x: Number.parseFloat(el.style.left), text: el.textContent ?? '' }))
    .filter(label => label.text !== '')

// The right margin used to be 40px only so the last label, centred on the last bucket, had room to hang
// past the plot. It is 16px now, so the labels have to be kept inside the chart instead.
describe('chart edges', () => {
  // Not bars: their padding rows already hold the last real bucket off the edge.
  for (const [name, Chart] of CHARTS.slice(0, 2)) {
    it(`${name}: keeps the end date labels inside the chart`, () => {
      const labels = xAxisLabels(renderChart(Chart).container)
      expect(labels.length).toBeGreaterThan(1)

      for (const { x, text } of labels.filter((_, i) => i === 0 || i === labels.length - 1)) {
        const half = (text.length * AXIS_LABEL_PX_PER_CHAR) / 2
        expect(x - half).toBeGreaterThanOrEqual(0)
        expect(x + half).toBeLessThanOrEqual(WIDTH)
      }
    })
  }

  for (const [name, Chart] of CHARTS) {
    it(`${name}: leaves a gap between the y labels and the plot`, () => {
      const { container } = renderChart(Chart)
      const column = container.querySelector<HTMLElement>('div.absolute.top-0.bottom-0')
      expect(column?.style.width).toBe(`${CHART_MARGIN.left - Y_AXIS_GAP}px`)
    })
  }

  it('draws one date pill, stopped at the right edge of the chart', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const data = HOURLY.map(p => ({ date: p.date }))
    const innerWidth = WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
    const value = {
      data,
      xAccessor: (d: Record<string, unknown>) => d.date as Date,
      dateLabels: data.map(() => ''),
      width: WIDTH,
      height: HEIGHT,
      innerWidth,
      margin: { bottom: 40, ...CHART_MARGIN },
      containerRef: { current: host },
      tooltipData: { point: data[24], index: 24, x: innerWidth, yPositions: {} },
    } as unknown as ChartContextValue

    render(
      <ChartProvider value={value}>
        <ChartTooltip />
      </ChartProvider>,
    )

    expect(document.querySelector('[data-upstream-pill]')).toBeNull()
    const pill = host.querySelector<HTMLElement>('.z-50')
    expect(pill?.style.getPropertyValue('--pill-x')).toBe(`${CHART_MARGIN.left + innerWidth}`)
    expect(pill?.style.translate).toContain(`clamp(calc(var(--pill-x) * -1px), -50%, calc(${WIDTH}px`)
  })
})
