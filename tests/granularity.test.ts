import { describe, expect, it } from 'bun:test'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import {
  autoGranularity,
  clampGranularity,
  clampRange,
  GRANULARITY_MAX_RANGE_MS,
  granularityDisabledReason,
  isGranularityAllowed,
  MAX_SUPPORTED_RANGE_MS,
  rangeDurationMs,
  resolveTileGranularity,
} from '@/lib/granularity'

// Expected caps are written as literal day/hour counts here on purpose — NOT derived from
// GRANULARITY_MAX_RANGE_MS — so a stray edit to a source constant fails a test instead of
// silently moving the boundary in lockstep with its own expectation.
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const TO = new Date('2026-06-17T00:00:00.000Z')
// Build a range of the given duration anchored at a fixed `to`, so tests are deterministic.
const rangeOf = (durationMs: number): TimeRange => ({ from: new Date(TO.getTime() - durationMs), to: TO })

describe('rangeDurationMs', () => {
  it('is 0 for an undefined range', () => {
    expect(rangeDurationMs(undefined)).toBe(0)
  })

  it('is the exact millisecond delta for a forward range', () => {
    expect(rangeDurationMs(rangeOf(14 * DAY_MS))).toBe(14 * DAY_MS)
  })

  it('clamps an inverted range (to before from) to 0 rather than going negative', () => {
    const inverted: TimeRange = { from: TO, to: new Date(TO.getTime() - DAY_MS) }
    expect(rangeDurationMs(inverted)).toBe(0)
  })
})

describe('isGranularityAllowed', () => {
  it('always allows UNSPECIFIED, even for an absurdly wide range', () => {
    expect(isGranularityAllowed(Granularity.UNSPECIFIED, rangeOf(50 * 365 * DAY_MS))).toBe(true)
  })

  it('treats the cap boundary as inclusive (<=)', () => {
    expect(isGranularityAllowed(Granularity.HOUR, rangeOf(14 * DAY_MS))).toBe(true)
    expect(isGranularityAllowed(Granularity.HOUR, rangeOf(14 * DAY_MS + 1))).toBe(false)
  })

  it('enforces the DAY cap at 365 days', () => {
    expect(isGranularityAllowed(Granularity.DAY, rangeOf(365 * DAY_MS))).toBe(true)
    expect(isGranularityAllowed(Granularity.DAY, rangeOf(365 * DAY_MS + 1))).toBe(false)
  })
})

describe('granularityDisabledReason', () => {
  it('returns null when the granularity fits the range', () => {
    expect(granularityDisabledReason(Granularity.HOUR, rangeOf(7 * DAY_MS))).toBeNull()
    expect(granularityDisabledReason(Granularity.UNSPECIFIED, rangeOf(50 * 365 * DAY_MS))).toBeNull()
  })

  it('returns a human-readable cap label when the granularity is too fine', () => {
    expect(granularityDisabledReason(Granularity.HOUR, rangeOf(30 * DAY_MS))).toBe(
      'Needs a time range of at most 14 days',
    )
    expect(granularityDisabledReason(Granularity.DAY, rangeOf(2 * 365 * DAY_MS))).toBe(
      'Needs a time range of at most 365 days',
    )
    expect(granularityDisabledReason(Granularity.WEEK, rangeOf(5 * 365 * DAY_MS))).toBe(
      'Needs a time range of at most 4 years',
    )
  })
})

describe('autoGranularity', () => {
  it('is UNSPECIFIED when there is no range', () => {
    expect(autoGranularity(undefined)).toBe(Granularity.UNSPECIFIED)
  })

  it('walks the ladder at the documented thresholds (1 / 90 / 730 days), inclusive', () => {
    expect(autoGranularity(rangeOf(DAY_MS))).toBe(Granularity.HOUR)
    expect(autoGranularity(rangeOf(DAY_MS + 1))).toBe(Granularity.DAY)
    expect(autoGranularity(rangeOf(90 * DAY_MS))).toBe(Granularity.DAY)
    expect(autoGranularity(rangeOf(90 * DAY_MS + 1))).toBe(Granularity.WEEK)
    expect(autoGranularity(rangeOf(730 * DAY_MS))).toBe(Granularity.WEEK)
    expect(autoGranularity(rangeOf(730 * DAY_MS + 1))).toBe(Granularity.MONTH)
  })

  it('lands a ~1-year range on WEEK (the deliberate 365→730 threshold change)', () => {
    expect(autoGranularity(rangeOf(365 * DAY_MS))).toBe(Granularity.WEEK)
  })
})

describe('clampGranularity', () => {
  it('leaves UNSPECIFIED ("Auto") untouched, even for a huge range', () => {
    expect(clampGranularity(Granularity.UNSPECIFIED, rangeOf(50 * 365 * DAY_MS))).toBe(Granularity.UNSPECIFIED)
  })

  it('keeps an already-valid pick as-is', () => {
    expect(clampGranularity(Granularity.DAY, rangeOf(30 * DAY_MS))).toBe(Granularity.DAY)
  })

  it('bumps a too-fine pick to the FINEST still-valid granularity, not the coarsest', () => {
    // Day is invalid past 365 days; the finest that fits ~400 days is Week, NOT Month.
    expect(clampGranularity(Granularity.DAY, rangeOf(400 * DAY_MS))).toBe(Granularity.WEEK)
    // Hour is invalid past 14 days; the finest that fits 30 days is Day.
    expect(clampGranularity(Granularity.HOUR, rangeOf(30 * DAY_MS))).toBe(Granularity.DAY)
  })
})

describe('clampRange', () => {
  it('returns undefined unchanged', () => {
    expect(clampRange(undefined)).toBeUndefined()
  })

  it('leaves a range within the supported max unchanged', () => {
    const r = rangeOf(365 * DAY_MS)
    expect(clampRange(r)).toEqual(r)
  })

  it('caps an over-wide range to the supported max, anchored on `to`', () => {
    const clamped = clampRange(rangeOf(50 * 365 * DAY_MS))
    expect(clamped?.to.getTime()).toBe(TO.getTime())
    expect(rangeDurationMs(clamped)).toBe(MAX_SUPPORTED_RANGE_MS)
  })

  it('exposes the coarsest cap (MONTH) as the supported max', () => {
    expect(MAX_SUPPORTED_RANGE_MS).toBe(3652 * DAY_MS)
  })
})

describe('cap map totality (a new Granularity must get a cap or fail the build)', () => {
  it('has a positive cap for every Granularity enum member', () => {
    const members = Object.values(Granularity).filter((v): v is Granularity => typeof v === 'number')
    expect(members.length).toBeGreaterThan(0)
    for (const g of members) {
      expect(GRANULARITY_MAX_RANGE_MS[g]).toBeGreaterThan(0)
    }
  })
})

describe('end-to-end invariant: a clamped range never yields an over-cap granularity', () => {
  // This is the regression guard for the bug where a >10-year range resolved to MONTH,
  // which exceeds MONTH's own cap and the backend rejects. clampRange must close it.
  const durations = [
    HOUR_MS,
    12 * HOUR_MS,
    2 * DAY_MS,
    60 * DAY_MS,
    200 * DAY_MS,
    400 * DAY_MS,
    800 * DAY_MS,
    50 * 365 * DAY_MS,
  ]

  it('autoGranularity(clampRange(r)) is always allowed for r', () => {
    for (const d of durations) {
      const clamped = clampRange(rangeOf(d))
      expect(isGranularityAllowed(autoGranularity(clamped), clamped)).toBe(true)
    }
  })

  it('clampGranularity(HOUR, clampRange(r)) is always allowed for r', () => {
    for (const d of durations) {
      const clamped = clampRange(rangeOf(d))
      expect(isGranularityAllowed(clampGranularity(Granularity.HOUR, clamped), clamped)).toBe(true)
    }
  })
})

describe('resolveTileGranularity (the dashboard/overview "Auto" → concrete resolution, C1)', () => {
  it('passes a concrete pick through unchanged', () => {
    expect(resolveTileGranularity(Granularity.WEEK, rangeOf(30 * DAY_MS))).toBe(Granularity.WEEK)
  })

  it('resolves "Auto" to a concrete, range-fitting granularity (so tiles never use their own over-cap default)', () => {
    expect(resolveTileGranularity(Granularity.UNSPECIFIED, rangeOf(7 * DAY_MS))).toBe(Granularity.DAY)
    expect(resolveTileGranularity(Granularity.UNSPECIFIED, rangeOf(365 * DAY_MS))).toBe(Granularity.WEEK)
  })

  it('returns undefined for "Auto" with no range — tiles then fall back to their own saved granularity', () => {
    expect(resolveTileGranularity(Granularity.UNSPECIFIED, undefined)).toBeUndefined()
  })
})
