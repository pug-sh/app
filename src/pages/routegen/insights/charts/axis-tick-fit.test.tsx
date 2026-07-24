import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { BarChart } from './bar-chart'
import { fitAxisTicks } from './helpers'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

describe('fitAxisTicks', () => {
  // "Jul 23 18:00" — the day-carrying hour label from a rolling-24h window.
  const wide = Array.from({ length: 5 }, () => 'Jul 23 18:00')

  it('keeps the requested count when the width has room', () => {
    expect(fitAxisTicks(820, wide, 5)).toBe(5)
  })

  it('thins the count on a narrow chart', () => {
    const fitted = fitAxisTicks(280, wide, 5)
    expect(fitted).toBeLessThan(5)
    expect(fitted).toBeGreaterThanOrEqual(2)
  })

  it('never drops below two ticks', () => {
    expect(fitAxisTicks(60, wide, 5)).toBe(2)
  })

  it('leaves terse labels alone at the same width that thins wide ones', () => {
    const terse = Array.from({ length: 5 }, () => '18:00')
    expect(fitAxisTicks(280, terse, 5)).toBe(5)
  })

  it('holds the requested count before measurement (width 0)', () => {
    expect(fitAxisTicks(0, wide, 5)).toBe(5)
  })

  it('budgets the fit on real labels and adds bar padding ticks back', () => {
    const padded = ['', ...wide, '']
    // 3 real labels fit -> 3 visible + 2 blank padding ticks the scorer spends on the ends.
    expect(fitAxisTicks(280, padded, 5)).toBe(fitAxisTicks(280, wide, 5) + 2)
  })
})

// The vendored charts size off the DOM, which happy-dom reports as 0x0 — without a real size they
// render nothing and every assertion passes vacuously. Mutable so a test can pick the width.
let mockChartSize = { width: 900, height: 400 }

vi.mock('@visx/responsive', () => ({
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
    .filter(text => /^[A-Z][a-z]{2} \d+ \d{2}:\d{2}$/.test(text)).length

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
