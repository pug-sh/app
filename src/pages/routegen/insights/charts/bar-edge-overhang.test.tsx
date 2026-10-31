import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { StaticChartPreviewProvider } from '@/components/charts/static-chart-preview-context'
import type { SeriesColor } from '@/lib/event-colors'
import { BarChart } from './bar-chart'
import { CHART_MARGIN } from './common'
import type { ChartPoint } from './types'

// happy-dom reports the container as 0x0, and an unsized chart renders no bars at all,
// so every assertion below would pass vacuously.
const WIDTH = 720
const HEIGHT = 300

vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: WIDTH, height: HEIGHT }),
}))

// The vendored localPoint needs SVG geometry happy-dom lacks; with no screen CTM it falls back to the bounding rect.
Object.defineProperty(window.SVGSVGElement.prototype, 'getScreenCTM', { value: () => null, configurable: true })

const NAMES = ['macOS', 'Windows', 'Linux']
const COLORS: SeriesColor[] = NAMES.map(() => ({ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }))

const daily = (count: number): ChartPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    date: new Date(Date.UTC(2026, 6, 16 + i)),
    values: [10 + i, 6, 3],
  }))

// The left margin is sized to the y labels, so the plot's width is read off the rendered plot group.
const innerWidth = (container: HTMLElement) => {
  const transform = container.querySelector('svg > g[transform^="translate("]')?.getAttribute('transform')
  return WIDTH - Number(transform?.match(/translate\(([\d.]+)/)?.[1]) - CHART_MARGIN.right
}

// Bars carry an x/width pair and a real width. Excluded by that: the chart's backdrops
// and grid, which span the full plot, and the series reveal clip, which is a zero-width
// rect deliberately inset to a negative x by half a bar so bars are not clipped in half.
const barRects = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('rect'))
    .map(r => ({ x: Number(r.getAttribute('x')), width: Number.parseFloat(r.getAttribute('width') ?? '') }))
    .filter(r => Number.isFinite(r.x) && r.width > 0 && r.width < innerWidth(container))

// The x-scale spans the first bucket to the last across the whole plot width, so without
// padding rows the edge buckets sit on the plot edges and half of each bar hangs outside
// it: over the y-axis labels on the left, clipped by the SVG on the right. Drop the
// padding from the wrapper and the 5-bucket case alone puts a bar at x=-70.
describe('bar chart edge overhang', () => {
  // Fewer buckets mean a wider slot, so the overhang grows as the data thins. Not one bucket:
  // a lone bucket lands centred, padded or not.
  for (const count of [2, 5, 30]) {
    it(`keeps every bar inside the plot at ${count} bucket(s)`, () => {
      const { container } = render(
        <BarChart
          data={daily(count)}
          seriesNames={NAMES}
          seriesColors={COLORS}
          granularity={Granularity.DAY}
          timeZone="UTC"
          stacked
        />,
      )

      const bars = barRects(container)
      expect(bars.length).toBeGreaterThan(0)

      for (const bar of bars) {
        expect(bar.x).toBeGreaterThanOrEqual(0)
        expect(bar.x + bar.width).toBeLessThanOrEqual(innerWidth(container))
      }
    })
  }

  // The padding rows carry a date and nothing else. If they ever gained series keys they
  // would draw as empty buckets at both ends; if the axis ever labelled them they would
  // read as real ones.
  it('draws and labels nothing for the padding rows', () => {
    const { container } = render(
      <BarChart
        data={daily(5)}
        seriesNames={NAMES}
        seriesColors={COLORS}
        granularity={Granularity.DAY}
        timeZone="UTC"
        stacked
      />,
    )

    // 5 buckets x 3 stacked series, and nothing for the two padding rows.
    expect(barRects(container)).toHaveLength(15)

    // Leaf elements only: an ancestor's textContent concatenates the whole axis.
    const labels = Array.from(container.querySelectorAll('*'))
      .filter(el => el.childElementCount === 0)
      .map(el => el.textContent?.trim() ?? '')
      .filter(text => /^[A-Z][a-z]{2} \d/.test(text))
    expect(labels).toEqual(['Jul 16', 'Jul 17', 'Jul 18', 'Jul 19', 'Jul 20'])
  })

  // The hover snaps to the nearest row, and a padding row is nearest across the strip beyond each edge bar.
  // happy-dom resolves every pointer to the last row, which here is the right-hand padding row.
  it('hovers the edge bucket, not a padding row, beyond the edge bar', async () => {
    const { container } = render(
      <StaticChartPreviewProvider>
        <BarChart
          data={daily(5)}
          seriesNames={NAMES}
          seriesColors={COLORS}
          granularity={Granularity.DAY}
          timeZone="UTC"
          stacked
        />
      </StaticChartPreviewProvider>,
    )

    fireEvent.mouseMove(container.querySelector('svg > g[transform^="translate("]') as SVGGElement, { clientX: 700 })

    // The last bucket's macOS count; a padding row reads 0 for every series.
    expect(await screen.findByText('14')).toBeTruthy()
    // The bars follow the shell's hover, not the tooltip's: the last bucket's three stay lit, the rest dim.
    const opacities = () => Array.from(container.querySelectorAll('rect')).map(r => r.style.opacity)
    await waitFor(() => expect(opacities().filter(o => o === '0.3')).toHaveLength(12))
    expect(opacities().filter(o => o === '1')).toHaveLength(NAMES.length)
  })
})
