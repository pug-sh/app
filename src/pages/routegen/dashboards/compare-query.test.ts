import { describe, expect, it } from 'vitest'
import type { TimeRange } from '@/components/date-range-picker'
import { inZone } from '@/test/timezone'
import { formatComparePeriodLabel, priorPeriodRange } from './compare-query'

// Local-time constructors throughout, so the zone cancels out against a host reporting zone.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo, d, h, mi)

// Host zone, no alignment. Read lazily so it picks up whatever zone inZone installed.
const win = (selected: TimeRange, queried = selected) => ({
  queried,
  selected,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
})

describe('priorPeriodRange', () => {
  // The reason this rule exists: shifting by the window's own length compared this morning against
  // yesterday evening, so every partial-day delta was a daypart artifact that moved all day.
  it('compares a partial day against the same hours of the day before', () => {
    const prior = priorPeriodRange(win({ from: at(2026, 6, 22), to: at(2026, 6, 22, 9) }))
    expect(prior.from).toEqual(at(2026, 6, 21))
    expect(prior.to).toEqual(at(2026, 6, 21, 9))
  })

  it('leaves a rolling window shifting by its own length', () => {
    const prior = priorPeriodRange(win({ from: at(2026, 6, 21, 9), to: at(2026, 6, 22, 9) }))
    expect(prior.from).toEqual(at(2026, 6, 20, 9))
    expect(prior.to).toEqual(at(2026, 6, 21, 9))
  })

  it('compares a partial week against the same days of the week before', () => {
    // Jul 20 2026 is a Monday; three and a half days in.
    const prior = priorPeriodRange(win({ from: at(2026, 6, 20), to: at(2026, 6, 23, 12) }))
    expect(prior.from).toEqual(at(2026, 6, 13))
    expect(prior.to).toEqual(at(2026, 6, 16, 12))
  })

  it('compares a partial month against the same days of the month before', () => {
    const prior = priorPeriodRange(win({ from: at(2026, 6, 1), to: at(2026, 6, 11, 8) }))
    expect(prior.from).toEqual(at(2026, 5, 1))
    expect(prior.to).toEqual(at(2026, 5, 11, 8))
  })

  it('compares a partial year against the same span of the year before', () => {
    const prior = priorPeriodRange(win({ from: at(2026, 0, 1), to: at(2026, 1, 10) }))
    expect(prior.from).toEqual(at(2025, 0, 1))
    expect(prior.to).toEqual(at(2025, 1, 10))
  })

  // A rolling multi-day window overflows the unit it starts on, so it keeps the length shift.
  it('keeps the length shift for "Last 7 days", which overruns its start unit', () => {
    const prior = priorPeriodRange(win({ from: at(2026, 6, 15), to: at(2026, 6, 22, 9) }))
    expect(prior.from).toEqual(at(2026, 6, 7, 15))
    expect(prior.to).toEqual(at(2026, 6, 15))
  })

  it('lands on the shorter month rather than overflowing into the next', () => {
    const prior = priorPeriodRange(win({ from: at(2026, 2, 1), to: at(2026, 2, 5) }))
    expect(prior.from).toEqual(at(2026, 1, 1))
    expect(prior.to).toEqual(at(2026, 1, 5))
  })

  // Only within an ordinary day — a civil shift changes length across DST or a shorter month.
  it('preserves the elapsed offset within an ordinary day', () => {
    const range = { from: at(2026, 6, 22), to: at(2026, 6, 22, 9, 37) }
    const prior = priorPeriodRange(win(range))
    expect(prior.to.getTime() - prior.from.getTime()).toBe(range.to.getTime() - range.from.getTime())
  })

  // No DST needed: adding March's length onto Feb 1 ran the prior month three days into this one.
  it('ends the prior month before the current one starts', () => {
    const range = { from: at(2026, 2, 1), to: at(2026, 2, 31, 23, 59) }
    const prior = priorPeriodRange(win(range))
    expect(prior.from).toEqual(at(2026, 1, 1))
    expect(prior.to).toEqual(at(2026, 1, 28, 23, 59))
  })
})

// A calendar unit is only 24h × n long when no transition sits inside it.
describe('priorPeriodRange across DST', () => {
  it('still reads a 25-hour fall-back day as a day', () => {
    inZone('America/Los_Angeles', () => {
      const range = { from: at(2025, 10, 2), to: at(2025, 10, 2, 23, 59) }
      expect(formatComparePeriodLabel(win(range))).toBe('vs prior day')

      const prior = priorPeriodRange(win(range))
      expect(prior.from).toEqual(at(2025, 10, 1))
      expect(prior.to).toEqual(at(2025, 10, 1, 23, 59))
    })
  })

  // Rebuilding the end from elapsed ms pushed the prior day 59 minutes into the current one.
  it('keeps the prior window clear of the current one after a short day', () => {
    inZone('America/Los_Angeles', () => {
      const range = { from: at(2025, 2, 10), to: at(2025, 2, 10, 23, 59) }
      const prior = priorPeriodRange(win(range))
      expect(prior.to.getTime()).toBeLessThanOrEqual(range.from.getTime())
    })
  })
})

// Classifying the queried window turned "Last 24 hours" into a week or a month for the hour after
// midnight — silently, since the Overview badge never names the period.
describe('priorPeriodRange ignores the alignment that produced its queried window', () => {
  it('keeps a rolling day rolling when its queried start floors onto a Monday', () => {
    // Jul 20 2026 is a Monday, so "Last 24 hours" read at 00:30 on the 21st floors to Monday 00:00.
    const selected = { from: at(2026, 6, 20, 0, 30), to: at(2026, 6, 21, 0, 30) }
    const queried = { from: at(2026, 6, 20), to: at(2026, 6, 21, 0, 30) }

    expect(formatComparePeriodLabel(win(selected, queried))).toBe('vs prior 24h')
    expect(priorPeriodRange(win(selected, queried)).to).toEqual(queried.from)
  })

  it('keeps a rolling day rolling when its queried start floors onto the 1st', () => {
    const selected = { from: at(2026, 9, 1, 0, 30), to: at(2026, 9, 2, 0, 30) }
    const queried = { from: at(2026, 9, 1), to: at(2026, 9, 2, 0, 30) }

    expect(formatComparePeriodLabel(win(selected, queried))).toBe('vs prior 24h')
    expect(priorPeriodRange(win(selected, queried)).to).toEqual(queried.from)
  })

  // The shift still applies to the queried window, so the two periods stay adjacent.
  it('shifts the queried window, not the selected one', () => {
    const selected = { from: at(2026, 6, 22), to: at(2026, 6, 22, 9, 20) }
    const queried = { from: at(2026, 6, 22), to: at(2026, 6, 22, 9) }
    expect(priorPeriodRange(win(selected, queried)).to).toEqual(at(2026, 6, 21, 9))
  })
})

// Both consumers floor `from` in the reporting zone, so the unit has to be read there too.
describe('priorPeriodRange reads the calendar in the reporting zone', () => {
  it('recognises a reporting-zone midnight the host zone does not share', () => {
    inZone('America/New_York', () => {
      const range = { from: new Date('2026-07-21T18:30:00Z'), to: new Date('2026-07-22T03:30:00Z') }
      const w = { queried: range, selected: range, timeZone: 'Asia/Kolkata' }

      expect(formatComparePeriodLabel(w)).toBe('vs prior day')
      expect(priorPeriodRange(w).from).toEqual(new Date('2026-07-20T18:30:00Z'))
    })
  })

  it("shifts by the reporting zone's DST rather than the host's", () => {
    inZone('UTC', () => {
      // Nov 2 2025 00:00–23:59 in Los Angeles — a 25-hour day the host zone knows nothing about.
      const range = { from: new Date('2025-11-02T07:00:00Z'), to: new Date('2025-11-03T07:59:00Z') }
      const w = { queried: range, selected: range, timeZone: 'America/Los_Angeles' }

      expect(formatComparePeriodLabel(w)).toBe('vs prior day')
      expect(priorPeriodRange(w).from).toEqual(new Date('2025-11-01T07:00:00Z'))
    })
  })
})

describe('formatComparePeriodLabel', () => {
  it('names the unit the comparison actually used', () => {
    expect(formatComparePeriodLabel(win({ from: at(2026, 6, 22), to: at(2026, 6, 22, 9) }))).toBe('vs prior day')
    expect(formatComparePeriodLabel(win({ from: at(2026, 6, 20), to: at(2026, 6, 23) }))).toBe('vs prior week')
    expect(formatComparePeriodLabel(win({ from: at(2026, 6, 1), to: at(2026, 6, 11) }))).toBe('vs prior month')
  })

  it('keeps the length phrasing for rolling windows', () => {
    expect(formatComparePeriodLabel(win({ from: at(2026, 6, 21, 9), to: at(2026, 6, 22, 9) }))).toBe('vs prior 24h')
    expect(formatComparePeriodLabel(win({ from: at(2026, 6, 15), to: at(2026, 6, 22, 9) }))).toBe('vs prior 7d')
  })
})
