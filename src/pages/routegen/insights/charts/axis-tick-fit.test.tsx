import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { BarChart } from './bar-chart'
import { pickAxisTicks } from './helpers'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

describe('pickAxisTicks', () => {
  const labels = Array.from({ length: 25 }, () => 'Jul 23 18:00')
  const at = (width: number) => labels.map((_, i) => (i * width) / 24)
  const minGap = (xs: number[], picked: number[]) =>
    Math.min(...picked.slice(1).map((index, k) => xs[index] - xs[picked[k]]))

  it('never lets neighbouring labels overlap', () => {
    for (const width of [280, 360, 600, 820]) {
      const xs = at(width)
      const picked = pickAxisTicks(labels, xs, 5)
      if (picked.length > 1) expect(minGap(xs, picked)).toBeGreaterThanOrEqual(12 * 7)
    }
  })

  it('spaces ticks at a constant stride', () => {
    const picked = pickAxisTicks(labels, at(600), 5)
    const strides = new Set(picked.slice(1).map((index, k) => index - picked[k]))
    expect(strides.size).toBe(1)
  })

  it('caps the count at maxTicks when the width has room', () => {
    expect(pickAxisTicks(labels, at(4000), 5).length).toBeLessThanOrEqual(5)
  })

  it('leaves terse labels denser than wide ones at the same width', () => {
    const terse = labels.map(() => '18:00')
    expect(pickAxisTicks(terse, at(360), 25).length).toBeGreaterThan(pickAxisTicks(labels, at(360), 25).length)
  })

  it('never puts a tick on a bar padding row', () => {
    const padded = ['', ...labels, '']
    const xs = padded.map((_, i) => (i * 600) / 26)
    const picked = pickAxisTicks(padded, xs, 5)
    expect(picked.every(index => padded[index] !== '')).toBe(true)
  })
})

// The vendored charts size off the DOM, which happy-dom reports as 0x0; without a real size they
// render nothing and every assertion passes vacuously. Mutable so a test can pick the width.
let mockChartSize = { width: 900, height: 400 }

vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children(mockChartSize),
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

// 25 hourly buckets crossing midnight UTC, so every axis label carries its day ("Jul 23 18:00").
const DAY_CROSSING: ChartPoint[] = Array.from({ length: 25 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 6, 23, 15 + i)),
  values: [i + 1],
}))

const dayLabelCount = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('div'))
    .map(el => el.textContent?.trim() ?? '')
    .filter(text => /^[A-Z][a-z]{2} \d+(?:, \d{4})? \d{2}:\d{2}$/.test(text)).length

// Renders the actual chart, so it fails against the unfixed axis (fixed count -> same labels at any width).
describe('x-axis thins day-carrying labels to the width', () => {
  for (const [name, Chart] of [
    ['line', LineChart],
    ['bar', BarChart],
  ] as const) {
    it(`${name} chart shows fewer labels when narrow than when wide`, () => {
      const renderAt = (size: typeof mockChartSize) => {
        mockChartSize = size
        return dayLabelCount(
          render(
            <Chart
              data={DAY_CROSSING}
              seriesNames={['page_view']}
              seriesColors={COLORS}
              granularity={Granularity.HOUR}
              timeZone="UTC"
            />,
          ).container,
        )
      }

      const wideCount = renderAt({ width: 900, height: 400 })
      const narrowCount = renderAt({ width: 360, height: 400 })

      expect(wideCount).toBeGreaterThanOrEqual(5)
      expect(narrowCount).toBeLessThan(wideCount)
      expect(narrowCount).toBeGreaterThanOrEqual(2)
    })
  }
})

// The reported case: hourly bars across two days, where the vendored scorer put neighbours three
// buckets apart, closer than an "Oct 16 12:00" label is wide.
describe('rendered x-axis labels never overlap', () => {
  for (const [name, Chart] of [
    ['line', LineChart],
    ['bar', BarChart],
  ] as const) {
    it(`${name} chart`, () => {
      for (const width of [360, 380, 480, 600, 760, 900]) {
        mockChartSize = { width, height: 300 }
        const { container, unmount } = render(
          <Chart
            data={DAY_CROSSING}
            seriesNames={['page_view']}
            seriesColors={COLORS}
            granularity={Granularity.HOUR}
            timeZone="UTC"
          />,
        )
        const ticks = Array.from(container.querySelectorAll<HTMLElement>('div.absolute'))
          .filter(el => /^[A-Z][a-z]{2} \d+ \d{2}:\d{2}$/.test(el.textContent?.trim() ?? ''))
          .map(el => ({ left: Number.parseFloat(el.style.left), chars: el.textContent?.trim().length ?? 0 }))
          .sort((a, b) => a.left - b.left)
        for (let i = 1; i < ticks.length; i++) {
          const room = ((ticks[i - 1].chars + ticks[i].chars) / 2) * 7
          expect(ticks[i].left - ticks[i - 1].left, `${width}px`).toBeGreaterThanOrEqual(room)
        }
        unmount()
      }
    })
  }
})
