import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { AreaChart } from './area-chart'
import { BarChart } from './bar-chart'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

// Same reason as vendored-date-labels.test.tsx: happy-dom reports the container as 0x0, and a
// chart with no size renders no SVG at all, so every assertion here would pass vacuously.
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

const DATA: ChartPoint[] = [
  { date: new Date('2026-07-19T00:00:00Z'), values: [1] },
  { date: new Date('2026-07-19T01:00:00Z'), values: [5] },
  { date: new Date('2026-07-19T02:00:00Z'), values: [3] },
]

const clipIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('clipPath'))
    .map(clip => clip.id)
    .filter(Boolean)

// Guards the clip-id rewrite in vite.config.ts. The vendored charts pass a hardcoded clipPathId,
// so two charts of one type on a page emit the same <clipPath id> — and since url(#id) resolves to
// the first in document order, the later chart is clipped by the first one's rect and loses
// whatever falls outside it. Silent whenever the two plots happen to be the same size, which is
// why it needs a test rather than an eye.
describe('vendored chart clip ids', () => {
  for (const [name, Chart] of [
    ['line', LineChart],
    ['area', AreaChart],
    ['bar', BarChart],
  ] as const) {
    it(`${name}: two charts on a page do not share a clip id`, () => {
      const { container } = render(
        <>
          <Chart data={DATA} granularity={Granularity.HOUR} seriesColors={COLORS} seriesNames={['a']} timeZone="UTC" />
          <Chart data={DATA} granularity={Granularity.HOUR} seriesColors={COLORS} seriesNames={['a']} timeZone="UTC" />
        </>,
      )

      const ids = clipIds(container)
      expect(ids.length).toBeGreaterThan(1)
      expect(new Set(ids).size).toBe(ids.length)
    })
  }
})
