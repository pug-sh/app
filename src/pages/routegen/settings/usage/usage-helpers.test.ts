import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UsageDay } from '@/api/genproto/dashboard/usage/v1/usage_pb'
import { inZone, inZoneAsync } from '@/test/timezone'
import {
  buildUsageSeries,
  DAY_MS,
  formatPeriod,
  lastNUtcDays,
  OTHERS_LABEL,
  RANGE_OPTIONS,
  unmeteredTailDays,
  validDate,
} from './usage-helpers'

// Run the UTC assertions outside UTC, where a local-midnight implementation lands on a different
// day. CI runs in UTC, where local and UTC agree and every one of them would pass either way.
// Both directions are covered: west lands a day early, east a day late, and a fix for one does not
// imply a fix for the other.
const WESTERN = 'America/Los_Angeles'
const EASTERN = 'Asia/Kolkata'

const cell = (day: string, projectId: string, eventCount: number) =>
  ({ day: timestampFromDate(new Date(day)), projectId, eventCount: BigInt(eventCount) }) as UsageDay

// Builds the shapes a well-behaved server never sends: an unset stamp, or one so far out of range
// that protobuf-es hands back an Invalid Date rather than throwing.
const rawCell = (day: unknown, projectId: string, eventCount: number) =>
  ({ day, projectId, eventCount: BigInt(eventCount) }) as UsageDay

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

  // The clock is pinned, and that is the whole point. A local-midnight implementation is only
  // distinguishable from this one during the hours the two zones disagree on the date — about 7 of
  // 24 in Los Angeles — so an unpinned version of this test passes against the bug most of the day.
  // Asserting the exact day also matters: `Date.UTC(...)` returns midnight for whatever day it is
  // handed, so a `/T00:00:00.000Z$/` match is true by construction and proves nothing.
  describe('anchoring, with the clock pinned', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('anchors on the UTC day west of UTC, where local is still on the previous date', () => {
      inZone(WESTERN, () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-13T04:00:00Z')) // 21:00 on Aug 12 in Los Angeles
        const { from, to } = lastNUtcDays(30)

        // Local day parts would floor to Aug 12 and close the window a day early.
        expect(to.toISOString()).toBe('2026-08-14T00:00:00.000Z')
        expect(from.toISOString()).toBe('2026-07-15T00:00:00.000Z')
      })
    })

    it('anchors on the UTC day east of UTC, where local has already rolled over', () => {
      inZone(EASTERN, () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-13T20:00:00Z')) // 01:30 on Aug 14 in Kolkata
        const { from, to } = lastNUtcDays(30)

        // Local day parts would floor to Aug 14 and close the window a day late.
        expect(to.toISOString()).toBe('2026-08-14T00:00:00.000Z')
        expect(from.toISOString()).toBe('2026-07-15T00:00:00.000Z')
      })
    })
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

describe('unmeteredTailDays', () => {
  const window = () => range('2026-08-01T00:00:00Z', '2026-08-11T00:00:00Z')

  it('counts the days the chart fills with zero because the meter never reached them', () => {
    // Meter last ran on the 5th, so the 6th through the 10th are unmetered rather than empty —
    // five zero bars that would otherwise read as a usage collapse.
    expect(unmeteredTailDays(window(), new Date('2026-08-05T06:00:00Z'))).toBe(5)
  })

  it('is zero once the meter has run through the end of the window', () => {
    expect(unmeteredTailDays(window(), new Date('2026-08-10T23:00:00Z'))).toBe(0)
  })

  it('is zero when the meter has never run', () => {
    expect(unmeteredTailDays(window(), null)).toBe(0)
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
    expect(series.projectTotals).toEqual([{ projectId: 'a', name: 'Project a', total: 50, seriesIndex: 0 }])
  })

  // The lower bound alone carries the test above, so the exclusive upper bound needs its own: a
  // cell dated exactly `to` would reach the totals but never reach a bar, because the day loop
  // stops at `t < toMs`.
  it('excludes a cell dated exactly the exclusive upper bound', () => {
    const series = buildUsageSeries(
      [cell('2026-08-02T00:00:00Z', 'a', 999), cell('2026-08-01T00:00:00Z', 'a', 5)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.windowTotal).toBe(5)
    expect(series.outOfWindow).toBe(1)
  })

  // The invariant the range filter exists to hold, asserted directly rather than via a single
  // total: anything that reaches the totals must also reach a bar, or the caption describes a
  // wider window than the chart draws.
  it('keeps the window total equal to the sum of every plotted value', () => {
    const series = buildUsageSeries(
      [
        cell('2026-07-31T00:00:00Z', 'a', 1000),
        cell('2026-08-01T00:00:00Z', 'a', 5),
        cell('2026-08-01T00:00:00Z', 'b', 7),
        cell('2026-08-02T00:00:00Z', 'a', 2000),
      ],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    const plotted = series.points.reduce((sum, p) => sum + p.values.reduce((a, b) => a + b, 0), 0)
    expect(plotted).toBe(series.windowTotal)
    expect(series.windowTotal).toBe(12)
    expect(series.outOfWindow).toBe(2)
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

  // Names are deliberately inverted against ids here, so the assertion discriminates between the
  // two possible tie-break keys instead of passing on either. It has to be the id: projectName
  // returns an id fragment until projectsAtom fills, so a name-keyed sort reorders mid-page —
  // which is the reload stability this is supposed to provide.
  it('breaks equal totals by project id, which is stable before names load', () => {
    const inverted = (id: string) => (id === 'zulu' ? 'Alpha Corp' : 'Zulu Corp')
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', 'zulu', 5), cell('2026-08-01T00:00:00Z', 'alpha', 5)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      inverted,
    )

    expect(series.projectTotals.map(p => p.projectId)).toEqual(['alpha', 'zulu'])
  })

  it('numbers charted projects by series and leaves folded ones unnumbered', () => {
    const daily = Array.from({ length: 8 }, (_, i) => cell('2026-08-01T00:00:00Z', `p${i}`, 100 - i))
    const series = buildUsageSeries(daily, range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'), named)

    // Six charted series, then the folded band — so a row can find its own color without the
    // caller re-deriving it from array position.
    expect(series.projectTotals.map(p => p.seriesIndex)).toEqual([0, 1, 2, 3, 4, 5, null, null])
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

// This is a metering surface, so a cell the page cannot read has to be counted rather than dropped:
// dropped silently, a bad response understates the total, and a wholly bad one renders the "no
// metered events" empty state — the page asserting zero usage while the server said otherwise.
describe('buildUsageSeries — unreadable cells', () => {
  it('counts a cell with no timestamp instead of dropping it silently', () => {
    const series = buildUsageSeries(
      [rawCell(undefined, 'a', 5_000_000), cell('2026-08-01T00:00:00Z', 'b', 10)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.malformed).toBe(1)
    expect(series.windowTotal).toBe(10)
  })

  it('reports malformed even when every cell is unreadable, so zero is never asserted', () => {
    const series = buildUsageSeries(
      [rawCell(undefined, 'a', 5_000_000)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    // projectTotals is empty either way — `malformed` is the only thing separating "no events"
    // from "we could not read the events".
    expect(series.projectTotals).toEqual([])
    expect(series.malformed).toBe(1)
  })

  it('survives a timestamp too large to be a date, rather than throwing mid-render', () => {
    // Seconds expressed in microseconds. protobuf-es returns an Invalid Date here instead of
    // throwing, and an Invalid Date is truthy — so it passes a `!day` guard, defeats the range
    // comparison (NaN is false both ways) and only blows up later, inside toISOString().
    const daily = [rawCell({ seconds: 1754006400000000n, nanos: 0 }, 'a', 7)]

    expect(() => buildUsageSeries(daily, range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'), named)).not.toThrow()

    const series = buildUsageSeries(daily, range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'), named)
    expect(series.malformed).toBe(1)
    expect(series.windowTotal).toBe(0)
  })

  it('rejects a negative count rather than subtracting it from the window total', () => {
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', 'a', -50), cell('2026-08-01T00:00:00Z', 'b', 100)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    // Counted, the share column divides by 50 and reports a negative percentage.
    expect(series.malformed).toBe(1)
    expect(series.windowTotal).toBe(100)
  })

  it('refuses a cell with no project rather than bucketing it under a blank id', () => {
    // proto3 defaults an omitted string to '', which is a usable Map key — every unattributed cell
    // would otherwise collapse into one series and render as a project with a blank id.
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', '', 500), cell('2026-08-01T00:00:00Z', 'a', 10)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.malformed).toBe(1)
    expect(series.projectTotals.map(p => p.projectId)).toEqual(['a'])
    expect(series.windowTotal).toBe(10)
  })

  // Every other check here catches a defect that understates the total. This is the only one that
  // would inflate it, which is why the repeat is refused outright rather than summed: a retried
  // meter row would otherwise bill the org twice with nothing on screen to say so.
  it('refuses a repeated (project, day) cell instead of summing it', () => {
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', 'a', 100), cell('2026-08-01T00:00:00Z', 'a', 100)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.windowTotal).toBe(100)
    expect(series.malformed).toBe(1)
  })

  it('still sums one project across different days', () => {
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', 'a', 10), cell('2026-08-02T00:00:00Z', 'a', 5)],
      range('2026-08-01T00:00:00Z', '2026-08-03T00:00:00Z'),
      named,
    )

    expect(series.windowTotal).toBe(15)
    expect(series.malformed).toBe(0)
  })

  // An out-of-window cell is not unreadable, so it is counted separately — but it must still be
  // counted, or a response entirely outside the window renders as "no metered events".
  it('reports out-of-window cells rather than rendering them as no events at all', () => {
    const series = buildUsageSeries(
      [cell('2026-01-15T00:00:00Z', 'a', 1_000_000)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.projectTotals).toEqual([])
    expect(series.outOfWindow).toBe(1)
    expect(series.malformed).toBe(0)
  })

  it('samples what it refused, so the console line names rows rather than only a count', () => {
    const series = buildUsageSeries(
      [rawCell(undefined, 'a', 1), cell('2026-08-01T00:00:00Z', '', 2), cell('2026-08-01T00:00:00Z', 'c', -3)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.rejected.map(r => r.reason)).toEqual(['unreadableDay', 'noProject', 'badCount'])
  })

  it('reports nothing refused for a clean response', () => {
    const series = buildUsageSeries(
      [cell('2026-08-01T00:00:00Z', 'a', 10)],
      range('2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      named,
    )

    expect(series.malformed).toBe(0)
    expect(series.outOfWindow).toBe(0)
    expect(series.rejected).toEqual([])
  })
})

describe('formatPeriod', () => {
  it('names the last day of the period, not the exclusive bound', () => {
    const label = formatPeriod(new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))
    expect(label).toBe('Aug 1 – Aug 31, 2026')
  })

  // Re-imported inside the zone: the formatters are built at import time, so this is the only way
  // to construct them under a non-UTC zone. Drop the `timeZone: 'UTC'` pin in utcFormat and this
  // goes red — the top-level import above stays green on a UTC runner either way.
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
