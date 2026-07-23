import { describe, expect, it } from 'vitest'
import { formatLocality } from '@/lib/location'

describe('formatLocality', () => {
  it('drops a region that only repeats the city', () => {
    expect(formatLocality('Lagos', 'Lagos')).toBe('Lagos')
    expect(formatLocality('Lagos', 'lagos')).toBe('Lagos')
  })

  it('trims both parts', () => {
    expect(formatLocality('Berlin', ' Bavaria ')).toBe('Berlin, Bavaria')
  })

  it('falls back to whichever part is present', () => {
    expect(formatLocality(undefined, 'Bavaria')).toBe('Bavaria')
    expect(formatLocality('Berlin')).toBe('Berlin')
    expect(formatLocality()).toBe('')
  })
})
