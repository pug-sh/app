import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { describe, expect, it, vi } from 'vitest'
import type { UsageDay } from '@/api/genproto/dashboard/usage/v1/usage_pb'
import { inZone, inZoneAsync } from '@/test/timezone'
import { buildUsageSeries, DAY_MS, formatPeriod, lastNUtcDays, OTHERS_LABEL, RANGE_OPTIONS } from './usage-helpers'

// Run the UTC assertions west of UTC, where a local-midnight implementation lands a day early.
// CI runs in UTC, where local and UTC agree and every one of them would pass either way.
const WESTERN = 'America/Los_Angeles'

const cell = (day: string, projectId: string, eventCount: number) =>
  ({ day: timestampFromDate(new Date(day)), projectId, eventCount: BigInt(eventCount) }) as UsageDay

const range = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) })

const named = (id: string) => `Project ${id}`

describe('lastNUtcDays', () => {
  it('spans exactly n UTC days and ends after today', () => {
    const { from, to } = lastNUtcDays(30)
    expect(to.getTime() - from.getTime()).toBe(30 * DAY_MS)
    expect(from.toISOString()).toMatch(/T00:00:00\.000Z$/)
    expect(to.getTime()).toBeGreaterThan(Date.now())
  })

  it('keeps every preset under the request cap', () => {
    for (const { value } of RANGE_OPTIONS) {
      const { from, to } = lastNUtcDays(value)
      expect(to.getTime() - from.getTime()).toBeLessThanOrEqual(400 * DAY_MS)
    }
  })

  it('anchors on UTC midnight west of UTC', () => {
    inZone(WESTERN, () => {
      expect(lastNUtcDays(30).from.toISOString()).toMatch(/T00:00:00\.000Z$/)
    })
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
    // Summed across days, not overwritten by the last one.
    expect(series.projectTotals[0].total).toBe(15)
    expect(series.windowTotal).toBe(15)
  })

  it('ignores cells outside the range so totals match the points', () => {
    const series = buildUsageSeries(
      [cell('2026-01-15T00:00:00Z', 'a', 1_000_000), cell('2026-08-01T00:00:00Z', 'a', 50)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.windowTotal).toBe(50)
    expect(series.projectTotals).toEqual([{ projectId: 'a', name: 'Project a', total: 50 }])
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

  it('breaks equal totals by name, so colors survive a reload', () => {
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', 'zulu', 5), cell('2026-08-01T00:00:00Z', 'alpha', 5)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.projectTotals.map(p => p.projectId)).toEqual(['alpha', 'zulu'])
  })

  it('folds projects past the charted maximum into one series', () => {
    const daily = Array.from({ length: 9 }, (_, i) => cell('2026-08-01T00:00:00Z', `p${i}`, 100 - i))
    const series = buildUsageSeries(daily, range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'), named)

    expect(series.names).toHaveLength(7)
    expect(series.names.at(-1)).toBe(OTHERS_LABEL)
    // p6 + p7 + p8
    expect(series.points[0].values.at(-1)).toBe(94 + 93 + 92)
    expect(series.projectTotals).toHaveLength(9)
    // Folded projects still count toward the total the share column divides by.
    expect(series.windowTotal).toBe(864)
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

  // Re-imported inside the zone: the formatters are built at module load, so the already-imported
  // ones above are pinned to the runner's zone and would pass here whatever they were built with.
  it('holds the UTC boundary west of UTC', async () => {
    await inZoneAsync(WESTERN, async () => {
      vi.resetModules()
      const western = await import('./usage-helpers')

      expect(western.formatPeriod(new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))).toBe(
        'Aug 1 – Aug 31, 2026',
      )
      expect(western.formatUtcStamp(new Date('2026-08-12T02:15:00Z'))).toBe('Aug 12, 02:15 UTC')
    })
  })
})
