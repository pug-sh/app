import { act, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { AreaChart } from './area-chart'
import { COMPARE_KEY } from './common'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

// The vendored charts size themselves off the DOM, which happy-dom reports as 0x0 — without a real
// size they render nothing at all and every assertion below would vacuously pass.
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

// The live window peaks at 3; the compare window peaks an order of magnitude higher, which is what
// makes the y-axis able to tell whether the compare series was registered at all.
const DATA: ChartPoint[] = [
  { date: new Date('2026-07-19T00:00:00Z'), values: [1] },
  { date: new Date('2026-07-19T01:00:00Z'), values: [2] },
  { date: new Date('2026-07-19T02:00:00Z'), values: [3] },
]

// Same buckets, values 1000x larger — enough of a y-domain move to make the tween observable.
const TALL: ChartPoint[] = DATA.map(p => ({ ...p, values: [p.values[0] * 1000] }))

const COMPARISON = {
  label: 'vs prior day',
  values: [40, 50, 60],
  color: { line: '#4c8dff99', fill: '#4c8dff1a', dot: '#4c8dff99' },
}

// The y-axis labels, which the vendored YAxis portals into the chart container as HTML.
const yAxisMax = (container: HTMLElement) =>
  Math.max(
    ...Array.from(container.querySelectorAll('span'))
      .map(el => Number(el.textContent?.trim()))
      .filter(Number.isFinite),
  )

// A dashed series hands its stroke to the dash-tail overlay and leaves the base path `transparent`
// (`hasDashTail`), which is how the compare series is identified. The dashes themselves never paint
// here — the overlay measures with getTotalLength(), which happy-dom reports as 0.
const dashedPaths = (container: HTMLElement) => container.querySelectorAll('path[stroke="transparent"]')

// Without dashFromIndex the series keeps its own stroke, so finding this means it went solid.
const solidComparePaths = (container: HTMLElement) =>
  container.querySelectorAll(`path[stroke="${COMPARISON.color.line}"]`)

// The AreaClosed's fill is a gradient keyed on the dataKey, so each series' fill is findable by name.
const areaFills = (container: HTMLElement, dataKey: string) =>
  container.querySelectorAll(`path[fill^="url(#area-gradient-${dataKey}"]`)

const settle = async (steps = 40) => {
  for (let i = 0; i < steps; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25))
    })
  }
}

// Two things need pinning and they fail differently. Whether the shell *registered* the extra child
// shows on the y-axis — it scans children for a dataKey to build the configs that drive the domain,
// so a re-add that tightened that scan would leave the dashed line drawn against a domain that never
// accounted for it. Whether the series *renders* is separate: the scan reads element props, so the
// axis scales identically whether CompareArea returns an Area or null.
describe('compare-vs-prior series', () => {
  for (const [name, Chart] of [
    ['area', AreaChart],
    ['line', LineChart],
  ] as const) {
    const chart = (data: ChartPoint[], comparison?: typeof COMPARISON) => (
      <Chart
        data={data}
        seriesNames={['page_view']}
        seriesColors={COLORS}
        granularity={Granularity.HOUR}
        timeZone="UTC"
        comparison={comparison}
      />
    )

    it(`${name} chart scales the y-axis to cover the compare window`, async () => {
      const { container } = render(chart(DATA, COMPARISON))

      // The shell tweens the y-domain toward its target rather than landing on it synchronously.
      await waitFor(() => expect(yAxisMax(container)).toBeGreaterThanOrEqual(60))
    })

    it(`${name} chart leaves the y-axis on the live series without a comparison`, async () => {
      const { container } = render(chart(DATA))

      // Pins the other direction: without the comparison the axis must stay on the live series, or
      // the assertion above would pass on any chart that simply draws a tall axis.
      await waitFor(() => expect(yAxisMax(container)).toBeGreaterThan(0))
      expect(yAxisMax(container)).toBeLessThan(60)
    })

    it(`${name} chart draws the compare series dashed`, async () => {
      const { container } = render(chart(DATA, COMPARISON))
      await settle()

      expect(dashedPaths(container).length).toBeGreaterThan(0)
      expect(solidComparePaths(container)).toHaveLength(0)
    })

    it(`${name} chart draws no dashed series without a comparison`, async () => {
      const { container } = render(chart(DATA))
      await settle()

      expect(dashedPaths(container)).toHaveLength(0)
    })

    // Pins the settle gate against being permanently closed or gutted to `return null`, which the
    // axis assertions above cannot see. Its *transition* is not assertable here: happy-dom lands
    // the y-domain on its target synchronously, so the compare series is present on every frame of
    // a data change and a gate-free build is indistinguishable. Verify that half in a browser.
    it(`${name} chart still draws the compare series after a data change`, async () => {
      const { container, rerender } = render(chart(DATA, COMPARISON))
      await settle()
      expect(dashedPaths(container).length).toBeGreaterThan(0)

      rerender(chart(TALL, COMPARISON))
      await settle()

      expect(dashedPaths(container).length).toBeGreaterThan(0)
      expect(solidComparePaths(container)).toHaveLength(0)
    }, 30_000)
  }

  // Area only — a line has no fill to suppress. fillOpacity 0 is what drops the AreaClosed; a
  // filled reference series would paint over the live data underneath it.
  it('area chart draws the compare series without a fill', async () => {
    const { container } = render(
      <AreaChart
        data={DATA}
        seriesNames={['page_view']}
        seriesColors={COLORS}
        granularity={Granularity.HOUR}
        timeZone="UTC"
        comparison={COMPARISON}
      />,
    )
    await settle()

    expect(areaFills(container, COMPARE_KEY)).toHaveLength(0)
    // Non-vacuous: the live series' own fill is found by the same selector.
    expect(areaFills(container, 'series0').length).toBeGreaterThan(0)
  })
})
