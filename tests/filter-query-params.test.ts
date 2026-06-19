import { describe, expect, it } from 'bun:test'
import { TopKQuery_Dimension } from '@/api/genproto/shared/insights/v1/insights_pb'
import { readFilterQueryParams } from '@/hooks/use-filter-query-params'

const tkParam = (value: unknown) => `?tk=${encodeURIComponent(JSON.stringify(value))}`

describe('readFilterQueryParams — tk param', () => {
  it('restores a valid ranking with no warning', () => {
    const { topK, parseWarning } = readFilterQueryParams(
      tkParam({ dimension: TopKQuery_Dimension.PROPERTY, property: 'plan', metric: 1, limit: 10 }),
    )
    expect(topK?.dimension).toBe(TopKQuery_Dimension.PROPERTY)
    expect(topK?.property).toBe('plan')
    expect(parseWarning).toBeNull()
  })

  it('returns no topK and no warning when the param is absent', () => {
    const { topK, parseWarning } = readFilterQueryParams('')
    expect(topK).toBeUndefined()
    expect(parseWarning).toBeNull()
  })

  // I2: a present-but-unusable tk must warn, like every other restorable param,
  // instead of silently falling back to the default ranking.
  it('warns on malformed JSON', () => {
    const { topK, parseWarning } = readFilterQueryParams('?tk=not-json')
    expect(topK).toBeUndefined()
    expect(parseWarning).toContain('ranking')
  })

  it('warns on a non-object (array) value', () => {
    const { topK, parseWarning } = readFilterQueryParams(tkParam([1, 2, 3]))
    expect(topK).toBeUndefined()
    expect(parseWarning).toContain('ranking')
  })
})
