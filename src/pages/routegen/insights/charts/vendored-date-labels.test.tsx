import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { AreaChart } from './area-chart'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

// The vendored charts size themselves off the DOM, which happy-dom reports as
// 0x0 — without a real size they render nothing at all and every assertion below
// would vacuously pass.
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

const HOURLY: ChartPoint[] = [
  { date: new Date('2026-07-19T00:00:00Z'), values: [1] },
  { date: new Date('2026-07-19T01:00:00Z'), values: [5] },
  { date: new Date('2026-07-19T02:00:00Z'), values: [3] },
]

const axisLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('div'))
    .map(el => el.textContent?.trim() ?? '')
    .filter(text => /^\d{2}:\d{2}$/.test(text) || /^[A-Z][a-z]{2} \d/.test(text))

// Guards the formatDateLabel patch documented in CLAUDE.md. Upstream computes its
// x labels internally with a browser-local, granularity-blind formatter, so a
// re-add that drops the patch still type-checks and still renders — it just
// silently mislabels every bucket. Each chart entry point carries its own copy of
// the prop plumbing, so each needs its own guard.
describe('vendored chart date labels', () => {
  for (const [name, Chart] of [
    ['line', LineChart],
    ['area', AreaChart],
  ] as const) {
    it(`${name} chart renders hour buckets in the project reporting zone`, () => {
      const { container } = render(
        <Chart
          data={HOURLY}
          seriesNames={['page_view']}
          seriesColors={COLORS}
          granularity={Granularity.HOUR}
          timeZone="Asia/Kolkata"
        />,
      )

      const labels = axisLabels(container)

      // Asia/Kolkata is UTC+5:30, so midnight UTC is 05:30 local. Comparing against
      // the same data in UTC is what proves the zone is applied rather than the
      // host's — the assertion can't pass by coincidence on an IST machine.
      expect(labels).toContain('05:30')
      expect(labels).not.toContain('00:00')
    })

    it(`${name} chart varies labels by granularity`, () => {
      const hourly = render(
        <Chart
          data={HOURLY}
          seriesNames={['page_view']}
          seriesColors={COLORS}
          granularity={Granularity.HOUR}
          timeZone="UTC"
        />,
      )

      // Upstream's fallback formats every bucket as "Jul 19" regardless of
      // granularity, which is the visible symptom of a reverted patch.
      expect(axisLabels(hourly.container)).toContain('00:00')
      expect(axisLabels(hourly.container).some(l => l.startsWith('Jul'))).toBe(false)
    })
  }
})
