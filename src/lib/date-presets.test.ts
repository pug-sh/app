import { afterEach, describe, expect, it, vi } from 'vitest'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { inZone } from '@/test/timezone'
import { defaultRange, refreshTimeRange, TIME_RANGE_PRESETS } from './date-presets'
import { GRANULARITY_MAX_RANGE_MS } from './granularity'

// lastNMonths is module-private, so these go through the preset list.
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
  // setMonth on a 31st overflows into the next month; without setDate(0) "Last 3 months" loses one.
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

  // Without the +1, "Last 12 months" exceeds the backend's 365-day cap for Day granularity.
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

const HOUR_MS = 60 * 60 * 1000

// setHours counted wall-clock hours, so the preset queried a window its own label disagreed with.
describe('lastNHours', () => {
  it('spans 24 elapsed hours across the fall-back transition', () => {
    inZone('America/Los_Angeles', () => {
      at(2025, 10, 2, 10)
      const range = resolvePreset('Last 24 hours')
      expect(range.to.getTime() - range.from.getTime()).toBe(24 * HOUR_MS)
    })
  })

  it('spans 24 elapsed hours across the spring-forward transition', () => {
    inZone('America/Los_Angeles', () => {
      at(2025, 2, 9, 11)
      const range = resolvePreset('Last 24 hours')
      expect(range.to.getTime() - range.from.getTime()).toBe(24 * HOUR_MS)
    })
  })
})

const pick = (label: string) => ({ ...resolvePreset(label), label })

describe('refreshTimeRange', () => {
  it('re-resolves a labelled preset against the current clock', () => {
    at(2026, 7, 19, 10)
    const picked = pick('Last 24 hours')

    at(2026, 7, 19, 14)
    expect(refreshTimeRange(picked)).toEqual({
      from: new Date(2026, 7, 18, 14),
      to: new Date(2026, 7, 19, 14),
      label: 'Last 24 hours',
    })
  })

  it('leaves an unset range alone', () => {
    at(2026, 7, 19, 14)
    expect(refreshTimeRange(undefined)).toBeUndefined()
  })

  it('leaves a hand-picked range alone', () => {
    at(2026, 7, 19, 14)
    const custom = { from: new Date(2026, 6, 1), to: new Date(2026, 6, 8) }
    expect(refreshTimeRange(custom)).toBe(custom)
  })

  it('leaves a label no preset claims alone', () => {
    at(2026, 7, 19, 14)
    const renamed = { ...pick('Last 24 hours'), label: 'Past day' }
    expect(refreshTimeRange(renamed)).toBe(renamed)
  })

  // The label is refreshTimeRange's only handle; without it the events page re-queries its load window.
  it('re-resolves the events page default', () => {
    at(2026, 7, 19, 10)
    const initial = defaultRange()

    at(2026, 7, 19, 14)
    expect(refreshTimeRange(initial)?.to).toEqual(new Date(2026, 7, 19, 14))
  })
})

describe('defaultRange', () => {
  // 'This month' resolved to a few hours on the 1st, so the events page had nothing to load more of.
  it('does not shrink on the 1st of the month', () => {
    at(2026, 10, 1, 0, 42)
    expect(defaultRange().from).toEqual(new Date(2026, 9, 2))
  })
})
