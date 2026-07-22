import { describe, expect, it } from 'vitest'
import { inZone } from '@/test/timezone'
import { formatComparePeriodLabel, priorPeriodRange } from './compare-query'

// Local-time constructors throughout, matching compare-query.ts, so the zone cancels out.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo, d, h, mi)

describe('priorPeriodRange', () => {
  // The reason this rule exists: shifting by the window's own length compared this morning against
  // yesterday evening, so every partial-day delta was a daypart artifact that moved all day.
  it('compares a partial day against the same hours of the day before', () => {
    const prior = priorPeriodRange({ from: at(2026, 6, 22), to: at(2026, 6, 22, 9) })
    expect(prior.from).toEqual(at(2026, 6, 21))
    expect(prior.to).toEqual(at(2026, 6, 21, 9))
  })

  it('leaves a rolling window shifting by its own length', () => {
    const prior = priorPeriodRange({ from: at(2026, 6, 21, 9), to: at(2026, 6, 22, 9) })
    expect(prior.from).toEqual(at(2026, 6, 20, 9))
    expect(prior.to).toEqual(at(2026, 6, 21, 9))
  })

  it('compares a partial week against the same days of the week before', () => {
    // Jul 20 2026 is a Monday; three and a half days in.
    const prior = priorPeriodRange({ from: at(2026, 6, 20), to: at(2026, 6, 23, 12) })
    expect(prior.from).toEqual(at(2026, 6, 13))
    expect(prior.to).toEqual(at(2026, 6, 16, 12))
  })

  it('compares a partial month against the same days of the month before', () => {
    const prior = priorPeriodRange({ from: at(2026, 6, 1), to: at(2026, 6, 11, 8) })
    expect(prior.from).toEqual(at(2026, 5, 1))
    expect(prior.to).toEqual(at(2026, 5, 11, 8))
  })

  it('compares a partial year against the same span of the year before', () => {
    const prior = priorPeriodRange({ from: at(2026, 0, 1), to: at(2026, 1, 10) })
    expect(prior.from).toEqual(at(2025, 0, 1))
    expect(prior.to).toEqual(at(2025, 1, 10))
  })

  // A rolling multi-day window overflows the unit it starts on, so it keeps the length shift.
  it('keeps the length shift for "Last 7 days", which overruns its start unit', () => {
    const prior = priorPeriodRange({ from: at(2026, 6, 15), to: at(2026, 6, 22, 9) })
    expect(prior.from).toEqual(at(2026, 6, 7, 15))
    expect(prior.to).toEqual(at(2026, 6, 15))
  })

  it('lands on the shorter month rather than overflowing into the next', () => {
    const prior = priorPeriodRange({ from: at(2026, 2, 1), to: at(2026, 2, 5) })
    expect(prior.from).toEqual(at(2026, 1, 1))
    expect(prior.to).toEqual(at(2026, 1, 5))
  })

  it('keeps both windows the same length', () => {
    const range = { from: at(2026, 6, 22), to: at(2026, 6, 22, 9, 37) }
    const prior = priorPeriodRange(range)
    expect(prior.to.getTime() - prior.from.getTime()).toBe(range.to.getTime() - range.from.getTime())
  })

  // No DST needed: adding March's length onto Feb 1 ran the prior month three days into this one.
  it('ends the prior month before the current one starts', () => {
    const range = { from: at(2026, 2, 1), to: at(2026, 2, 31, 23, 59) }
    const prior = priorPeriodRange(range)
    expect(prior.from).toEqual(at(2026, 1, 1))
    expect(prior.to).toEqual(at(2026, 1, 28, 23, 59))
  })
})

// A calendar unit is only 24h × n long when no transition sits inside it.
describe('priorPeriodRange across DST', () => {
  it('still reads a 25-hour fall-back day as a day', () => {
    inZone('America/Los_Angeles', () => {
      const range = { from: at(2025, 10, 2), to: at(2025, 10, 2, 23, 59) }
      expect(formatComparePeriodLabel(range)).toBe('vs prior day')

      const prior = priorPeriodRange(range)
      expect(prior.from).toEqual(at(2025, 10, 1))
      expect(prior.to).toEqual(at(2025, 10, 1, 23, 59))
    })
  })

  // Rebuilding the end from elapsed ms pushed the prior day 59 minutes into the current one.
  it('keeps the prior window clear of the current one after a short day', () => {
    inZone('America/Los_Angeles', () => {
      const range = { from: at(2025, 2, 10), to: at(2025, 2, 10, 23, 59) }
      const prior = priorPeriodRange(range)
      expect(prior.to.getTime()).toBeLessThanOrEqual(range.from.getTime())
    })
  })
})

describe('formatComparePeriodLabel', () => {
  it('names the unit the comparison actually used', () => {
    expect(formatComparePeriodLabel({ from: at(2026, 6, 22), to: at(2026, 6, 22, 9) })).toBe('vs prior day')
    expect(formatComparePeriodLabel({ from: at(2026, 6, 20), to: at(2026, 6, 23) })).toBe('vs prior week')
    expect(formatComparePeriodLabel({ from: at(2026, 6, 1), to: at(2026, 6, 11) })).toBe('vs prior month')
  })

  it('keeps the length phrasing for rolling windows', () => {
    expect(formatComparePeriodLabel({ from: at(2026, 6, 21, 9), to: at(2026, 6, 22, 9) })).toBe('vs prior 24h')
    expect(formatComparePeriodLabel({ from: at(2026, 6, 15), to: at(2026, 6, 22, 9) })).toBe('vs prior 7d')
  })
})
