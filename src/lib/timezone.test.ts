import { describe, expect, it } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { nextZoneBucket } from './timezone'

describe('nextZoneBucket', () => {
  const utc = (y: number, mo: number, d: number, h = 0) => new Date(Date.UTC(y, mo, d, h))

  it('steps hour buckets by exactly one hour', () => {
    expect(nextZoneBucket(utc(2026, 6, 20, 9), Granularity.HOUR, 'UTC')).toEqual(utc(2026, 6, 20, 10))
  })

  // NY springs forward 2026-03-08, so that day is 23h: Mar 8 00:00 EST (05:00 UTC) → Mar 9 00:00
  // EDT (04:00 UTC). A fixed +24h step would land an hour into the next day.
  it('steps a DST spring-forward day by 23 hours, not 24', () => {
    expect(nextZoneBucket(utc(2026, 2, 8, 5), Granularity.DAY, 'America/New_York')).toEqual(utc(2026, 2, 9, 4))
  })

  it('steps month buckets across uneven lengths', () => {
    expect(nextZoneBucket(utc(2026, 0, 1), Granularity.MONTH, 'UTC')).toEqual(utc(2026, 1, 1))
    expect(nextZoneBucket(utc(2026, 1, 1), Granularity.MONTH, 'UTC')).toEqual(utc(2026, 2, 1))
  })

  it('steps week buckets by seven days', () => {
    expect(nextZoneBucket(utc(2026, 6, 19), Granularity.WEEK, 'UTC')).toEqual(utc(2026, 6, 26))
  })

  it('has no step to take for Auto/unspecified granularity', () => {
    expect(nextZoneBucket(utc(2026, 6, 20), Granularity.UNSPECIFIED, 'UTC')).toBeNull()
  })
})
