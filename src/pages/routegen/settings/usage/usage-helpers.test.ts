import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { describe, expect, it } from 'vitest'
import type { UsageDay } from '@/api/genproto/dashboard/usage/v1/usage_pb'
import { inZone } from '@/test/timezone'
import { buildUsageSeries, formatPeriod, formatUtcStamp, lastNUtcDays, OTHERS_LABEL } from './usage-helpers'

// Run the UTC assertions west of UTC, where a local-midnight implementation lands a day early.
// In the runner's own zone (east of UTC) they pass either way and prove nothing.
const WESTERN = 'America/Los_Angeles'

const cell = (day: string, projectId: string, eventCount: number) =>
  ({ day: timestampFromDate(new Date(day)), projectId, eventCount: BigInt(eventCount) }) as UsageDay

const range = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) })

const named = (id: string) => `Project ${id}`

describe('lastNUtcDays', () => {
  it('spans exactly n UTC days and ends after today', () => {
    const { from, to } = lastNUtcDays(30)
    expect(to.getTime() - from.getTime()).toBe(30 * 24 * 60 * 60 * 1000)
    expect(from.toISOString()).toMatch(/T00:00:00\.000Z$/)
    expect(to.getTime()).toBeGreaterThan(Date.now())
  })

  it('stays under the request cap at the widest preset', () => {
    const { from, to } = lastNUtcDays(365)
    expect(to.getTime() - from.getTime()).toBeLessThanOrEqual(400 * 24 * 60 * 60 * 1000)
  })
})

describe('buildUsageSeries', () => {
  it('emits one point per UTC day, filling days with no row', () => {
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', 'a', 10), cell('2026-08-03T00:00:00Z', 'a', 5)],
      range('2026-08-01T00:00:00Z', '2026-08-04T00:00:00Z'),
      named,
    )

    expect(series.points.map(p => p.values[0])).toEqual([10, 0, 5])
    expect(series.points.map(p => p.date.toISOString().slice(0, 10))).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
  })

  it('keeps each project in its own series on a shared day', () => {
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', 'a', 10), cell('2026-08-01T00:00:00Z', 'b', 4)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.names).toEqual(['Project a', 'Project b'])
    expect(series.points[0].values).toEqual([10, 4])
    expect(series.windowTotal).toBe(14)
  })

  it('orders projects by total, descending', () => {
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', 'small', 1), cell('2026-08-01T00:00:00Z', 'big', 99)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.projectTotals.map(p => p.projectId)).toEqual(['big', 'small'])
  })

  it('folds projects past the charted maximum into one series', () => {
    const daily = Array.from({ length: 9 }, (_, i) => cell('2026-08-01T00:00:00Z', `p${i}`, 100 - i))
    const series = buildUsageSeries(daily, range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'), named)

    expect(series.names).toHaveLength(7)
    expect(series.names.at(-1)).toBe(OTHERS_LABEL)
    // p6 + p7 + p8
    expect(series.points[0].values.at(-1)).toBe(94 + 93 + 92)
    expect(series.projectTotals).toHaveLength(9)
  })

  it('buckets a cell by its UTC day, not the local one', () => {
    inZone(WESTERN, () => {
      const series = buildUsageSeries(
        [cell('2026-08-02T00:00:00Z', 'a', 7)],
        range('2026-08-01T00:00:00Z', '2026-08-03T00:00:00Z'),
        named,
      )

      expect(series.points.map(p => p.values[0])).toEqual([0, 7])
      expect(series.points.map(p => p.date.toISOString().slice(0, 10))).toEqual(['2026-08-01', '2026-08-02'])
    })
  })

  it('has no series and no points for an empty window', () => {
    const series = buildUsageSeries([], range('2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z'), named)

    expect(series.names).toEqual([])
    expect(series.points).toEqual([])
    expect(series.windowTotal).toBe(0)
  })
})

describe('formatPeriod', () => {
  it('names the last day of the period, not the exclusive bound', () => {
    const label = formatPeriod(new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))
    expect(label).toBe('Aug 1 – Aug 31, 2026')
  })

  it('holds the UTC boundary west of UTC', () => {
    inZone(WESTERN, () => {
      expect(formatPeriod(new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))).toBe(
        'Aug 1 – Aug 31, 2026',
      )
      expect(formatUtcStamp(new Date('2026-08-12T02:15:00Z'))).toBe('Aug 12, 02:15 UTC')
    })
  })
})
