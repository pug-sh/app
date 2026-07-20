import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

const HEIGHT = 400

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: HEIGHT }),
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

const HOURLY: ChartPoint[] = Array.from({ length: 24 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 6, 20, i)),
  values: [14 + ((i * 7) % 23)],
}))

const DAILY: ChartPoint[] = Array.from({ length: 8 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 6, 13 + i)),
  values: [314 + i * 180],
}))

const seriesPathD = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('path'))
    .filter(p => p.getAttribute('stroke') === COLORS[0].line)
    .map(p => p.getAttribute('d') ?? '')
    .join(' ')

// Every y coordinate the path visits. happy-dom has no SVG geometry, so read the
// numbers out of the `d` string.
const pathYs = (d: string) => Array.from(d.matchAll(/[ML,C]\s*(-?[\d.]+),(-?[\d.]+)/g)).map(m => Number(m[2]))

// Step in frame-sized slices rather than one long sleep: the bug needs a y-domain
// tween frame to land *between* the path tween's start and its end, and a single
// act() sleep lets React batch past that window.
const settle = async (steps = 60) => {
  for (let i = 0; i < steps; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25))
    })
  }
}

const chart = (data: ChartPoint[], granularity: Granularity) => (
  <LineChart data={data} seriesNames={['page_view']} seriesColors={COLORS} granularity={granularity} timeZone="UTC" />
)

// The vendored Line's point-morph tween (`useAnimatedSeriesPath`) lists `yScale` in
// its effect deps, and a data change also tweens the y-domain — so a domain frame
// tears the effect down, the re-run bails on the unchanged transition signature, and
// the morph is stranded on its first frame: points already carrying the *new* values
// but still scaled by the *old* domain. The line parks thousands of pixels off-plot
// and never recovers. The wrapper opts out with `animate={false}`.
describe('line chart data change', () => {
  it('keeps the series inside the plot after the data changes', async () => {
    const { container, rerender } = render(chart(HOURLY, Granularity.HOUR))
    await settle()
    expect(seriesPathD(container)).not.toBe('')

    rerender(chart(DAILY, Granularity.DAY))
    await settle()

    const ys = pathYs(seriesPathD(container))
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(HEIGHT)
  }, 30_000)
})
