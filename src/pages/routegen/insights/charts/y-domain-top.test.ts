import { scaleLinear } from 'd3-scale'
import { describe, expect, it } from 'vitest'
import { niceYDomain, resolveTimeSeriesYDomain } from '@/components/charts/y-domain-utils'
import { Y_TICK_COUNT } from './common'

// Guards alignYDomainToAxisTicks in vite.config.ts. Unpatched, a 98,000 peak tops out at 110,000 under a last label of
// 100,000, and a 456 peak at 550: the tenth of padding carried it past 500.
const peaks = Array.from({ length: 400 }, (_, i) => Math.round(0.05 * 1.04 ** i * 1000) / 1000)
const roundedAtTickCount = (peak: number) => scaleLinear().domain([0, peak]).nice(Y_TICK_COUNT).domain()

describe('the vendored y-domain', () => {
  it.each([146, 137, 9, 61, 1234, 0.7, 98_000])('ends on a labeled tick for a peak of %s', peak => {
    const domain = niceYDomain(resolveTimeSeriesYDomain([{ v: peak }], ['v'], undefined))
    expect(scaleLinear().domain(domain).ticks(Y_TICK_COUNT).at(-1)).toBe(domain[1])
  })

  // Exactly the bare peak rounded at the axis's count, so a padded peak, another count or a coarser rounding all fail.
  it('rounds a series peak at Y_TICK_COUNT', () => {
    for (const peak of peaks)
      expect(niceYDomain(resolveTimeSeriesYDomain([{ v: peak }], ['v'], undefined)), `${peak}`).toEqual(
        roundedAtTickCount(peak),
      )
  })

  it('rounds a stacked peak at Y_TICK_COUNT', () => {
    for (const peak of peaks)
      expect(niceYDomain(resolveTimeSeriesYDomain([], [], peak)), `${peak}`).toEqual(roundedAtTickCount(peak))
  })
})
