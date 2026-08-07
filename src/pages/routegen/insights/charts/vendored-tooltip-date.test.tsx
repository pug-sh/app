import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { useChartStable } from '@/components/charts/chart-context'
import type { SeriesColor } from '@/lib/event-colors'
import { inZone } from '@/test/timezone'
import { AreaChart } from './area-chart'
import { BarChart } from './bar-chart'
import { formatTooltipDate } from './helpers'
import { LineChart } from './line-chart'
import type { ChartPoint } from './types'

// The shells early-return under 10px and happy-dom reports the container as 0x0,
// so without a size nothing renders and every assertion below passes vacuously.
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

// The hover pill only mounts once the enter phase settles and a pointer event lands,
// so driving it would test the vendored interaction machine rather than our seam.
// The wrapper's only job is the context it hands the tooltip, so stand in for the
// vendored tooltip and read that context back. Nothing else imports this module.
vi.mock('@/components/charts/tooltip', () => ({
  ChartTooltip: () => <output>{useChartStable().dateLabels.join('|')}</output>,
}))

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

const HOURLY: ChartPoint[] = [
  { date: new Date('2026-07-19T00:00:00Z'), values: [1] },
  { date: new Date('2026-07-19T01:00:00Z'), values: [5] },
]

const tooltipLabels = (container: HTMLElement) => container.querySelector('output')?.textContent?.split('|') ?? []

// The axis and the tooltip are siblings under the shell and re-provide the chart
// context independently, so each needs its own formatter. Feeding both the axis one
// drops the day from every hover — and an hourly range runs up to 14 days, so a bare
// "05:30" cannot say which day it lands on.
describe('vendored chart tooltip dates', () => {
  for (const [name, Chart] of [
    ['line', LineChart],
    ['area', AreaChart],
    ['bar', BarChart],
  ] as const) {
    it(`${name} chart hover labels carry the day, not just the clock time`, () => {
      const { container } = render(
        <Chart
          data={HOURLY}
          seriesNames={['page_view']}
          seriesColors={COLORS}
          granularity={Granularity.HOUR}
          timeZone="Asia/Kolkata"
        />,
      )

      // Asia/Kolkata is UTC+5:30, so midnight UTC is 05:30 local — the reporting zone
      // has to reach the tooltip too, not just the axis.
      expect(tooltipLabels(container)).toContain('Jul 19, 05:30')

      // The pill's ticker splits on spaces into month/day columns and renders only those two, so a
      // third token is dropped on screen while still reading correctly here. Padding rows are blank.
      for (const label of tooltipLabels(container).filter(Boolean)) {
        expect(label.split(' ').length).toBeLessThanOrEqual(2)
      }
    })
  }
})

// Pure counterpart to the render assertions above: the two-token ceiling is a property of every
// granularity's label, not just the hourly one the charts are rendered with there.
describe('formatTooltipDate stays inside the ticker grammar', () => {
  const THIS_YEAR = new Date().getUTCFullYear()
  const AT = new Date(Date.UTC(THIS_YEAR, 5, 21))

  // Both years, because fmtDay only appends one outside the current year — a same-year fixture
  // alone let the DAY branch ship three tokens.
  const FIXTURES = [
    ['this year', AT],
    ['a prior year', new Date(Date.UTC(THIS_YEAR - 1, 11, 15))],
  ] as const
  const GRANULARITIES = [
    ['HOUR', Granularity.HOUR],
    ['DAY', Granularity.DAY],
    ['WEEK', Granularity.WEEK],
    ['MONTH', Granularity.MONTH],
  ] as const

  it.each(
    GRANULARITIES.flatMap(([name, g]) => FIXTURES.map(([when, at]) => [`${name} in ${when}`, g, at] as const)),
  )('%s renders at most two ticker columns', (_name, granularity, at) => {
    expect(formatTooltipDate(at, granularity, 'Asia/Kolkata').split(' ').length).toBeLessThanOrEqual(2)
  })

  it('keeps the year on a day label inside the ticker grammar', () => {
    const label = formatTooltipDate(new Date(Date.UTC(THIS_YEAR - 1, 11, 15)), Granularity.DAY, 'UTC')
    expect(label.split(' ')).toHaveLength(2)
    expect(label.replaceAll('\u00a0', ' ')).toBe(`Dec 15, ${THIS_YEAR - 1}`)
  })

  // Auckland springs forward on Sep 28 2025, mid-week for a Monday-anchored UTC bucket: counting
  // the end in host civil days moved it an hour back, onto the day before.
  it('ends the week six days on in the reporting zone, not the host one', () => {
    inZone('Pacific/Auckland', () => {
      const monday = new Date('2025-09-22T00:00:00Z')
      const label = formatTooltipDate(monday, Granularity.WEEK, 'UTC')
      expect(label.replaceAll('\u00a0', ' ')).toBe('Sep 22, 2025 - Sep 28, 2025')
    })
  })

  // Los Angeles falls back inside its own Sunday-anchored bucket for the week of Nov 2 2025, so
  // 144 elapsed hours land at 23:00 on the 7th and the week read as ending a day early.
  it('ends the week six calendar days on when the reporting zone falls back', () => {
    inZone('UTC', () => {
      const sunday = new Date('2025-11-02T07:00:00Z')
      const label = formatTooltipDate(sunday, Granularity.WEEK, 'America/Los_Angeles')
      expect(label.replaceAll('\u00a0', ' ')).toBe('Nov 2, 2025 - Nov 8, 2025')
    })
  })

  // A range names its own months, so hoisting the first into the month column left "Jun  21 - Jun 27".
  it('keeps a week range whole rather than splitting its first month off', () => {
    const label = formatTooltipDate(AT, Granularity.WEEK, 'Asia/Kolkata')
    expect(label.split(' ')).toHaveLength(1)
    expect(label.replace(/\u00a0/g, ' ')).toBe('Jun 21 - Jun 27')
  })
})
