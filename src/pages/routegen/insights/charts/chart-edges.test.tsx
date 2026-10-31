import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { type ChartContextValue, ChartProvider } from '@/components/charts/chart-context'
import { StaticChartPreviewProvider } from '@/components/charts/static-chart-preview-context'
import type { SeriesColor } from '@/lib/event-colors'
import { AreaChart } from './area-chart'
import { BarChart } from './bar-chart'
import { CHART_MARGIN, Y_AXIS_GAP } from './common'
import { ChartTooltip } from './date-labels'
import { AXIS_LABEL_PX_PER_CHAR, yAxisLabelWidth } from './helpers'
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

// Spans two days, so every hour label carries the day and is the widest the axis draws. Five buckets all
// get a label, so the end ones sit on the plot edges.
const HOURLY: ChartPoint[] = Array.from({ length: 5 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 6, 19, 22 + i)),
  values: [i],
}))
const THOUSANDS = HOURLY.map(p => ({ ...p, values: p.values.map(v => v * 25_000) }))
const grouped = (value: number) => value.toLocaleString('en-US')

const CHARTS = [
  ['line', LineChart],
  ['area', AreaChart],
  ['bar', BarChart],
] as const

const renderChart = (Chart: (typeof CHARTS)[number][1], data = HOURLY, yTickFormatter?: (value: number) => string) =>
  render(
    <Chart
      data={data}
      seriesNames={['page_view']}
      seriesColors={COLORS}
      granularity={Granularity.HOUR}
      timeZone="UTC"
      yTickFormatter={yTickFormatter}
    />,
  )

const xAxisLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('div[style*="bottom: 12px"]'))
    .map(el => ({ x: Number.parseFloat(el.style.left), text: el.textContent ?? '' }))
    .filter(label => label.text !== '')

const yLabelColumn = (container: HTMLElement) => {
  const column = container.querySelector<HTMLElement>('div.absolute.overflow-hidden')
  return {
    width: Number.parseFloat(column?.style.width ?? ''),
    pad: Number.parseFloat(column?.querySelector<HTMLElement>('div')?.style.paddingRight ?? ''),
    labels: Array.from(column?.querySelectorAll('span') ?? [], span => span.textContent ?? ''),
  }
}

const fitsYLabels = (container: HTMLElement, scale = 1) => {
  const { width, pad, labels } = yLabelColumn(container)
  expect(labels.length).toBeGreaterThan(1)
  expect(width - pad).toBe(Math.ceil(Math.max(...labels.map(yAxisLabelWidth)) * scale))
  return width
}

const plotLeft = (container: HTMLElement) =>
  Number(
    container
      .querySelector('svg > g[transform^="translate("]')
      ?.getAttribute('transform')
      ?.match(/translate\(([\d.]+)/)?.[1],
  )

// The right margin used to be 40px only so the last label, centred on the last bucket, had room to hang
// past the plot. It only clears the hover halo now, so the labels have to be kept inside the chart instead.
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
      const { width, labels } = yLabelColumn(container)
      expect(labels.length).toBeGreaterThan(1)
      expect(width + Y_AXIS_GAP).toBe(plotLeft(container))
    })

    // The column was a fixed 40px, so a lone digit sat indented in room kept for a longer label and
    // "100,000" overflowed it. Read off the labels the axis drew, so a change to upstream's domain shows here.
    it(`${name}: sizes the y label column to the widest label it draws`, () => {
      const short = fitsYLabels(renderChart(Chart).container)
      const long = fitsYLabels(renderChart(Chart, THOUSANDS, grouped).container)
      expect(short).toBeLessThan(long)
    })

    // Peaks where dropping the nice step, or asking for four or six ticks, changes the labels drawn. The "%" makes
    // the width fractional, so it has to round up.
    it(`${name}: fits the labels upstream's domain and tick count decide`, () => {
      for (const peak of [8.5, 0.27, 0.35]) {
        const data = HOURLY.map((p, i) => ({ ...p, values: [i === 2 ? peak : 0] }))
        fitsYLabels(renderChart(Chart, data, value => `${value}%`).container)
      }
    })
  }

  // text-xs is rem, so the browser's font size setting scales every label past a column sized for 12px.
  it('scales the y label column with the root font size', () => {
    document.documentElement.style.fontSize = '20px'
    try {
      fitsYLabels(renderChart(LineChart).container, 1.25)
    } finally {
      document.documentElement.style.removeProperty('font-size')
    }
  })

  // The axis fades its old labels out as a new domain lands, so a column that narrowed with the data would clip the
  // old, wider ones. Static skips the reveal, during which a new domain snaps instead of tweening.
  it('keeps the y label column until the labels narrow', async () => {
    const chart = (data: ChartPoint[]) => (
      <StaticChartPreviewProvider>
        <LineChart
          data={data}
          seriesNames={['page_view']}
          seriesColors={COLORS}
          granularity={Granularity.HOUR}
          timeZone="UTC"
          yTickFormatter={grouped}
        />
      </StaticChartPreviewProvider>
    )
    const { container, rerender } = render(chart(THOUSANDS))
    const wide = fitsYLabels(container)

    rerender(chart(HOURLY))
    fitsYLabels(container)
    await waitFor(() => expect(fitsYLabels(container)).toBeLessThan(wide), { timeout: 2000 })
  })

  // The overview's traffic chart takes its axis from whichever period peaks higher.
  for (const [name, Chart] of CHARTS.slice(0, 2)) {
    it(`${name}: fits the y labels to a prior period that out-peaks this one`, () => {
      const comparison = { label: 'Previous period', values: HOURLY.map((_, i) => i * 100), color: COLORS[0] }
      const { container } = render(
        <Chart
          data={HOURLY}
          seriesNames={['page_view']}
          seriesColors={COLORS}
          granularity={Granularity.HOUR}
          timeZone="UTC"
          comparison={comparison}
        />,
      )
      fitsYLabels(container)
    })
  }

  it('bar: fits the y labels to the stacks, not the tallest bar', () => {
    const { container } = render(
      <BarChart
        data={HOURLY.map(p => ({ ...p, values: [6, 6] }))}
        seriesNames={['a', 'b']}
        seriesColors={[...COLORS, ...COLORS]}
        granularity={Granularity.HOUR}
        timeZone="UTC"
        stacked
      />,
    )
    fitsYLabels(container)
  })

  it('draws one date pill, stopped at the right edge of the chart', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const data = HOURLY.map(p => ({ date: p.date }))
    const last = data.length - 1
    const margin = { ...CHART_MARGIN, left: 40, bottom: 40 }
    const innerWidth = WIDTH - margin.left - margin.right
    const value = {
      data,
      xAccessor: (d: Record<string, unknown>) => d.date as Date,
      dateLabels: data.map(() => ''),
      width: WIDTH,
      height: HEIGHT,
      innerWidth,
      margin,
      containerRef: { current: host },
      tooltipData: { point: data[last], index: last, x: innerWidth, yPositions: {} },
    } as unknown as ChartContextValue

    render(
      <ChartProvider value={value}>
        <ChartTooltip />
      </ChartProvider>,
    )

    expect(document.querySelector('[data-upstream-pill]')).toBeNull()
    const pill = host.querySelector<HTMLElement>('.z-50')
    expect(pill?.style.getPropertyValue('--pill-x')).toBe(`${margin.left + innerWidth}`)
    expect(pill?.style.translate).toContain(`clamp(calc(var(--pill-x) * -1px), -50%, calc(${WIDTH}px`)
  })
})
