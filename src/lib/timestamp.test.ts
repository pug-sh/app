import { afterAll, describe, expect, it } from 'vitest'
import { formatUTCDate, validDate } from './timestamp'

const originalTZ = process.env.TZ

afterAll(() => {
  process.env.TZ = originalTZ
})

describe('formatUTCDate', () => {
  // CI runs with TZ=UTC, where dropping `timeZone: 'UTC'` changes nothing and the test cannot go
  // red. A western zone is the whole point: a period ending at UTC midnight renders a day early.
  it('renders the UTC calendar day from a western local zone', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(formatUTCDate(new Date('2026-07-10T00:00:00Z'))).toBe('Jul 10, 2026')
  })

  it('renders the UTC calendar day from an eastern local zone', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    expect(formatUTCDate(new Date('2026-07-10T23:59:00Z'))).toBe('Jul 10, 2026')
  })
})

describe('validDate', () => {
  it('rejects the Invalid Date protobuf-es returns for an out-of-range stamp', () => {
    // Truthy, and every comparison against it is false, so a bare null check passes it through to
    // Intl.DateTimeFormat.format() — which throws RangeError, during render.
    expect(validDate(new Date(Number.NaN))).toBeNull()
    expect(validDate(null)).toBeNull()

    const real = new Date('2026-08-01T00:00:00Z')
    expect(validDate(real)).toBe(real)
  })
})
