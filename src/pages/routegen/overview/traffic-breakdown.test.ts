import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import { DataPointSchema, TopKRowSchema, TrendSeriesSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import { rankSessionBreakdown, topKToRankedRows } from './traffic-breakdown'

describe('topKToRankedRows', () => {
  it('maps dimension values and mutes $others and the empty bucket', () => {
    const rows = [
      create(TopKRowSchema, { dimensionValue: 'google.com', value: 10 }),
      create(TopKRowSchema, { dimensionValue: '', value: 4 }),
      create(TopKRowSchema, { dimensionValue: '', value: 2, isOthers: true }),
    ]
    expect(topKToRankedRows(rows, '(no referrer)')).toEqual([
      { key: '0-google.com', label: 'google.com', value: 10, muted: false },
      { key: 'empty-1', label: '(no referrer)', value: 4, muted: true },
      { key: '$__others', label: '(others)', value: 2, muted: true },
    ])
  })
})

describe('rankSessionBreakdown', () => {
  const series = (path: string, values: number[]) =>
    create(TrendSeriesSchema, {
      breakdown: { $pathname: path },
      points: values.map(value => create(DataPointSchema, { value })),
    })

  it('sums each series, sorts descending, and caps at the limit', () => {
    const result = rankSessionBreakdown([series('/a', [1, 2, 3]), series('/b', [10]), series('/c', [4, 1])], 2)
    expect(result).toEqual([
      { key: '1-/b', label: '/b', value: 10, muted: false },
      { key: '0-/a', label: '/a', value: 6, muted: false },
    ])
  })

  it('labels an empty breakdown value for its property and mutes it', () => {
    expect(rankSessionBreakdown([series('', [5])], 10)[0]).toEqual({
      key: '0-(not set)',
      label: '(not set)',
      value: 5,
      muted: true,
    })
  })

  // Muted, it can't be clicked into a `$pathname = (others)` filter that matches nothing.
  it('mutes the overflow past the breakdown limit', () => {
    expect(rankSessionBreakdown([series('$others', [3])], 10)[0]).toMatchObject({
      label: '(others)',
      muted: true,
    })
  })
})
