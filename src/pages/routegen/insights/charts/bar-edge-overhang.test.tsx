import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { BarChart } from './bar-chart'
import type { ChartPoint } from './types'

// happy-dom reports the container as 0x0, and an unsized chart renders no bars at all —
// every assertion below would pass vacuously.
const WIDTH = 720
const HEIGHT = 300
const INNER_WIDTH = WIDTH - 40 - 40 // margin.left/right keep the vendored 40px default

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: WIDTH, height: HEIGHT }),
}))

const NAMES = ['macOS', 'Windows', 'Linux']
const COLORS: SeriesColor[] = NAMES.map(() => ({ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }))

const daily = (count: number): ChartPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    date: new Date(Date.UTC(2026, 6, 16 + i)),
    values: [10 + i, 6, 3],
  }))

// Bars carry an x/width pair and a real width. Excluded by that: the chart's backdrops
// and grid, which span the full plot, and the series reveal clip, which is a zero-width
// rect deliberately inset to a negative x by half a bar so bars are not clipped in half.
const barRects = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('rect'))
    .map(r => ({ x: Number(r.getAttribute('x')), width: Number.parseFloat(r.getAttribute('width') ?? '') }))
    .filter(r => Number.isFinite(r.x) && r.width > 0 && r.width < INNER_WIDTH)

// The x-scale spans the first bucket to the last across the whole plot width, so without
// padding rows the edge buckets sit on the plot edges and half of each bar hangs outside
// it — over the y-axis labels on the left, clipped by the SVG on the right. Drop the
// padding from the wrapper and the 5-bucket case alone puts a bar at x=-70.
describe('bar chart edge overhang', () => {
  // Fewer buckets meant a wider slot, so the overhang grew as the data thinned; one
  // bucket was the extreme, drawing a single bar 0.88 * innerWidth wide centred at x=0.
  for (const count of [1, 2, 5, 30]) {
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
        expect(bar.x + bar.width).toBeLessThanOrEqual(INNER_WIDTH)
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

    // Leaf elements only — an ancestor's textContent concatenates the whole axis.
    const labels = Array.from(container.querySelectorAll('*'))
      .filter(el => el.childElementCount === 0)
      .map(el => el.textContent?.trim() ?? '')
      .filter(text => /^[A-Z][a-z]{2} \d/.test(text))
    expect(labels).toEqual(['Jul 16', 'Jul 17', 'Jul 18', 'Jul 19', 'Jul 20'])
  })
})
