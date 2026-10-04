import { describe, expect, it } from 'vitest'
import heat from '@/theme/__fixtures__/heat.json'
import { heatStop, heatStyle } from './retention-cohort'

describe('the retention ramp', () => {
  // The fixture recorded the old hardcoded thresholds; the stops must land exactly where they did.
  it('puts each value on the stop the old ramp used', () => {
    heat.forEach((stop, i) => {
      expect(heatStop(stop.min)).toBe(i + 1)
      if (i > 0) expect(heatStop(stop.min - 0.01)).toBe(i)
    })
    expect(heatStop(100)).toBe(7)
  })

  it('reads fill and ink from the theme', () => {
    expect(heatStyle(40)).toEqual({ backgroundColor: 'var(--heat-4)', color: 'var(--heat-4-ink)' })
  })
})
