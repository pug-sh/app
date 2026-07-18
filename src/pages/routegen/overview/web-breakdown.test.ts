import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import { DataPointSchema, TopKRowSchema, TrendSeriesSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import { rankSessionBreakdown, topKToRankedRows } from './web-breakdown'

describe('topKToRankedRows', () => {
  it('maps dimension values and mutes $others and the empty bucket', () => {
    const rows = [
      create(TopKRowSchema, { dimensionValue: 'Chrome', value: 10 }),
      create(TopKRowSchema, { dimensionValue: '', value: 4 }),
      create(TopKRowSchema, { dimensionValue: '', value: 2, isOthers: true }),
    ]
    expect(topKToRankedRows(rows)).toEqual([
      { key: '0-Chrome', label: 'Chrome', value: 10, muted: false },
      { key: 'empty-1', label: '(none)', value: 4, muted: true },
      { key: '$__others', label: '$others', value: 2, muted: true },
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

  it('labels an empty breakdown value as (none) and mutes it', () => {
    expect(rankSessionBreakdown([series('', [5])], 10)[0]).toEqual({
      key: '0-(none)',
      label: '(none)',
      value: 5,
      muted: true,
    })
  })
})
