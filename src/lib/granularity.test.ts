import { describe, expect, it } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { alignRangeStart, GRANULARITY_MAX_RANGE_MS } from './granularity'

// Fixed UTC instants and named zones, so the result doesn't depend on the machine's local zone.
describe('alignRangeStart', () => {
  it('floors to the reporting-zone bucket start', () => {
    const range = { from: new Date('2026-07-20T18:00:00Z'), to: new Date('2026-07-20T19:00:00Z') }
    expect(alignRangeStart(range, Granularity.DAY, 'UTC')).toEqual(new Date('2026-07-20T00:00:00Z'))
  })

  // A ~365-day window the picker accepts: flooring pulls `from` back to the previous zone-day
  // start, which pushes the span past the backend's 365-day cap for Day and gets the query
  // rejected. Keeping the requested start is what makes it sendable.
  it('keeps the requested start when flooring would breach the granularity cap', () => {
    const range = { from: new Date('2025-07-21T00:00:00Z'), to: new Date('2026-07-20T19:10:00Z') }
    const floored = new Date('2025-07-20T04:00:00Z')
    expect(range.to.getTime() - floored.getTime()).toBeGreaterThan(GRANULARITY_MAX_RANGE_MS[Granularity.DAY])

    const aligned = alignRangeStart(range, Granularity.DAY, 'America/New_York')
    expect(aligned).toEqual(range.from)
    expect(range.to.getTime() - aligned.getTime()).toBeLessThanOrEqual(GRANULARITY_MAX_RANGE_MS[Granularity.DAY])
  })

  it('leaves the start alone for granularities with no bucket boundary', () => {
    const range = { from: new Date('2026-07-20T18:34:00Z'), to: new Date('2026-07-20T19:00:00Z') }
    expect(alignRangeStart(range, Granularity.UNSPECIFIED, 'UTC')).toEqual(range.from)
  })
})
