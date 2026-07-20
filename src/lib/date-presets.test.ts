import { afterEach, describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { TIME_RANGE_PRESETS } from './date-presets'
import { GRANULARITY_MAX_RANGE_MS } from './granularity'

// lastNMonths is module-private, so these go through the preset list that exposes it. Dates are
// built with local-time constructors, matching what date-presets.ts does, so the zone cancels out.
const resolvePreset = (label: string) => {
  const preset = TIME_RANGE_PRESETS.find(item => item.label === label)
  if (!preset) throw new Error(`no preset labelled '${label}'`)
  return preset.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

const at = (year: number, month: number, day: number, h = 0, m = 0, s = 0, ms = 0) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(year, month, day, h, m, s, ms))
}

describe('lastNMonths', () => {
  // setMonth on a 31st overflows into the following month when the target is shorter
  // (May 31 → Feb 31 → Mar 2 in a leap year). Without the setDate(0) correction `from` lands in
  // March, so "Last 3 months" silently loses a month.
  it('corrects the month-end overflow back into the shorter month', () => {
    at(2024, 4, 31, 12, 0, 0)
    expect(resolvePreset('Last 3 months').from).toEqual(new Date(2024, 2, 1))
  })

  it('lands on Feb 29 before the +1 in a leap year, and Feb 28 outside one', () => {
    at(2024, 4, 31, 12, 0, 0)
    expect(resolvePreset('Last 3 months').from).toEqual(new Date(2024, 2, 1))

    at(2023, 4, 31, 12, 0, 0)
    expect(resolvePreset('Last 3 months').from).toEqual(new Date(2023, 2, 1))
  })

  it('rolls across the year boundary', () => {
    at(2025, 11, 31, 12, 0, 0)
    expect(resolvePreset('Last 12 months').from).toEqual(new Date(2025, 0, 1))
  })

  it('starts the day after the anchor so the window spans exactly n months of buckets', () => {
    at(2026, 6, 20, 15, 30, 0)
    expect(resolvePreset('Last 3 months').from).toEqual(new Date(2026, 3, 21))
  })

  // The reason the +1 exists: without it "Last 12 months" is 365 days plus today's elapsed hours,
  // which the backend rejects for Day granularity.
  it('keeps "Last 12 months" inside the backend cap for Day granularity', () => {
    at(2026, 6, 20, 15, 30, 0)
    const range = resolvePreset('Last 12 months')
    expect(range.from).toEqual(new Date(2025, 6, 21))
    expect(range.to.getTime() - range.from.getTime()).toBeLessThanOrEqual(GRANULARITY_MAX_RANGE_MS[Granularity.DAY])
  })

  it('starts at midnight regardless of the current time of day', () => {
    at(2026, 6, 20, 23, 47, 13, 500)
    const range = resolvePreset('Last 6 months')
    expect(range.from).toEqual(new Date(2026, 0, 21))
    expect(range.to).toEqual(new Date(2026, 6, 20, 23, 47, 13, 500))
  })
})
