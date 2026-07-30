import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { AreaChart } from './area-chart'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

// The shape from the bug report: a sparse counter that sits at 0 for long stretches.
// A natural spline needs a run of equal values next to a spike to overshoot visibly.
const SPARSE: ChartPoint[] = Array.from({ length: 24 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 6, 29, i)),
  values: [i === 0 || i === 20 || i === 23 ? 1 : 0],
}))

const seriesPathD = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('path'))
    .filter(p => p.getAttribute('stroke') === COLORS[0].line)
    .map(p => p.getAttribute('d') ?? '')
    .join(' ')

// Every y the path visits, control points included — d3 comma-separates consecutive pairs,
// so the `,` in the class is what picks up the 2nd and 3rd pair of each cubic. happy-dom has
// no SVG geometry, so read them out of `d`; a cubic is bounded by its control polygon, so no
// control point below the baseline means no drawn curve below it either.
const pathYs = (d: string) => Array.from(d.matchAll(/[ML,C]\s*(-?[\d.]+),(-?[\d.]+)/g)).map(m => Number(m[2]))

// The plot bottom is y(0): the y-range is [innerHeight, 0] over a domain pinned at 0.
// The grid's fade mask is sized to the plot, which is the one place innerHeight reaches
// the DOM as a plain number.
const plotBottom = (container: HTMLElement) => {
  const rect = container.querySelector('mask rect')
  const height = Number(rect?.getAttribute('height'))
  expect(Number.isFinite(height) && height > 0).toBe(true)
  return height
}

const settle = async (steps = 60) => {
  for (let i = 0; i < steps; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25))
    })
  }
}

// The vendored Line defaults to curveNatural, which overshoots — and the y-domain pads
// 10% above the max but pins the floor at 0, so the undershoot is the only half that
// escapes the plot. Both wrappers pass SERIES_CURVE (monotone) instead.
describe('series curve', () => {
  it('keeps a line series that touches 0 above the zero baseline', async () => {
    const { container } = render(
      <LineChart
        data={SPARSE}
        granularity={Granularity.HOUR}
        seriesColors={COLORS}
        seriesNames={['signin']}
        timeZone="UTC"
      />,
    )
    await settle()

    const ys = pathYs(seriesPathD(container))
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(plotBottom(container))
  }, 30_000)

  // Not a regression for the line fix — Area's upstream default is already monotone, so this
  // passes with or without the explicit prop. It guards the direction of travel: a re-add that
  // flips that default would otherwise reintroduce the same bug on the area chart in silence.
  it('keeps an area series that touches 0 above the zero baseline', async () => {
    const { container } = render(
      <AreaChart
        data={SPARSE}
        granularity={Granularity.HOUR}
        seriesColors={COLORS}
        seriesNames={['signin']}
        timeZone="UTC"
      />,
    )
    await settle()

    const ys = pathYs(seriesPathD(container))
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(plotBottom(container))
  }, 30_000)
})
