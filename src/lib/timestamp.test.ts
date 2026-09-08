import { afterAll, describe, expect, it } from 'vitest'
import { formatLocalDate, formatUTCDate, validDate } from './timestamp'

const originalTZ = process.env.TZ

afterAll(() => {
  process.env.TZ = originalTZ
})

describe('formatUTCDate', () => {
  // CI runs TZ=UTC, where dropping `timeZone: 'UTC'` changes nothing and this cannot go red.
  it('renders the UTC calendar day from a western local zone', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(formatUTCDate(new Date('2026-07-10T00:00:00Z'))).toBe('Jul 10, 2026')
  })

  it('renders the UTC calendar day from an eastern local zone', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    expect(formatUTCDate(new Date('2026-07-10T23:59:00Z'))).toBe('Jul 10, 2026')
  })
})

describe('formatLocalDate', () => {
  // Neither is a UTC boundary, so UTC dates them a day off the charge the customer sees.
  it('renders the local calendar day for an instant that is not a UTC boundary', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    expect(formatLocalDate(new Date('2026-09-30T22:00:00Z'))).toBe('Oct 1, 2026')

    process.env.TZ = 'America/Los_Angeles'
    expect(formatLocalDate(new Date('2026-10-01T02:00:00Z'))).toBe('Sep 30, 2026')
  })
})

describe('validDate', () => {
  it('rejects the Invalid Date protobuf-es returns for an out-of-range stamp', () => {
    // Truthy, so a bare null check passes it to Intl.DateTimeFormat, which throws during render.
    expect(validDate(new Date(Number.NaN))).toBeNull()
    expect(validDate(null)).toBeNull()

    const real = new Date('2026-08-01T00:00:00Z')
    expect(validDate(real)).toBe(real)
  })
})
