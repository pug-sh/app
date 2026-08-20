import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { AreaChart } from './area-chart'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

type Size = { width: number; height: number }

const box = vi.hoisted(() => ({ resize: null as null | ((size: Size) => void) }))

// The height has to move from *inside* ParentSize. Driving it with `rerender` instead hands the
// shell a new `children` ref, which rebuilds `renderData` — a dep the overlay does re-measure on —
// so the bug never appears and the test passes against the unfixed code.
vi.mock('@visx/responsive', async () => {
  const { useState } = await import('react')
  return {
    ParentSize: ({ children }: { children: (size: Size) => ReactNode }) => {
      const [size, setSize] = useState<Size>({ width: 800, height: 400 })
      box.resize = setSize
      return children(size)
    },
  }
})

// happy-dom reports getTotalLength() as 0, which makes the overlay bail before drawing anything.
// Any nonzero length derived from the path is enough to put the dashes on screen.
// `restoreMocks` clears this before every test, so it cannot be a beforeAll.
beforeEach(() => {
  vi.spyOn(SVGPathElement.prototype, 'getTotalLength').mockImplementation(function (this: SVGPathElement) {
    return this.getAttribute('d')?.length ?? 0
  })
})

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

const DATA: ChartPoint[] = [
  { date: new Date('2026-07-19T00:00:00Z'), values: [1] },
  { date: new Date('2026-07-19T01:00:00Z'), values: [2] },
  { date: new Date('2026-07-19T02:00:00Z'), values: [3] },
]

const COMPARISON = {
  label: 'vs prior day',
  values: [40, 50, 60],
  color: { line: '#4c8dff99', fill: '#4c8dff1a', dot: '#4c8dff99' },
}

const settle = async (steps = 40) => {
  for (let i = 0; i < steps; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25))
    })
  }
}

// A dashed series leaves its base path `transparent` and hands the stroke to the overlay, so these
// are the same curve twice: the one the chart just drew, and the one the overlay last measured.
const livePathD = (container: HTMLElement) => container.querySelector('path[stroke="transparent"]')?.getAttribute('d')
const dashPathD = (container: HTMLElement) => container.querySelector('path[clip-path]')?.getAttribute('d')

describe('compare series on a height-only resize', () => {
  for (const [name, Chart] of [
    ['area', AreaChart],
    ['line', LineChart],
  ] as const) {
    it(`${name} chart re-measures the dash overlay`, async () => {
      const { container } = render(
        <Chart
          data={DATA}
          seriesNames={['page_view']}
          seriesColors={COLORS}
          granularity={Granularity.HOUR}
          timeZone="UTC"
          comparison={COMPARISON}
        />,
      )
      await settle()

      const tall = livePathD(container)
      expect(tall).toBeTruthy()
      expect(dashPathD(container)).toBe(tall)

      await act(async () => {
        box.resize?.({ width: 800, height: 240 })
      })
      await settle()

      const short = livePathD(container)
      // Non-vacuous: the shorter plot has to have moved the curve, or the next line is free.
      expect(short).not.toBe(tall)
      expect(dashPathD(container)).toBe(short)
    }, 30_000)
  }
})
