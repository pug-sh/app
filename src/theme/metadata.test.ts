import { describe, expect, it } from 'vitest'
import { isCalendarDay } from './metadata'

describe('isCalendarDay', () => {
  it.each(['2026-10-13', '2024-02-29', '2000-02-29', '0001-01-01'])('takes %s', day =>
    expect(isCalendarDay(day)).toBe(true),
  )

  it.each([
    '2026-02-30',
    '2025-02-29',
    '1900-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-10-00',
    '0000-01-01',
    '2026-1-13',
    '13-10-2026',
    '2026-10-13T00:00:00Z',
    '',
  ])('refuses %j', day => expect(isCalendarDay(day)).toBe(false))
})
