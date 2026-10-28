import { describe, expect, it } from 'vitest'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { createFilter } from './filter-model'
import { filterViolation, numberHint, rangeHint, rangeInvalidBounds } from './filter-validation'

const tenant = createFilter('tenant', PropertySource.PROFILE, FilterOperator.IN, ['acme', 'other'])

describe('filterViolation', () => {
  it('reports why the request validator would refuse a filter', () => {
    const amount = (operator: FilterOperator, payload: string | string[]) =>
      filterViolation(createFilter('amount', PropertySource.CUSTOM, operator, payload))
    expect(filterViolation(tenant)).toBeUndefined()
    expect(amount(FilterOperator.BETWEEN, ['5', '10'])).toBeUndefined()
    expect(filterViolation(createFilter('tenant', PropertySource.PROFILE, FilterOperator.IN, []))).toMatch(
      /not be empty/,
    )
    expect(amount(FilterOperator.GT, 'abc')).toMatch(/valid numbers/)
    expect(amount(FilterOperator.BETWEEN, ['10', '5'])).toMatch(/values\[0\] <= values\[1\]/)
  })
})

describe.each([
  ['greater than', FilterOperator.GT],
  ['greater or equal', FilterOperator.GTE],
  ['less than', FilterOperator.LT],
  ['less or equal', FilterOperator.LTE],
])('numberHint on %s', (_label, operator) => {
  it.each(['5', '0', '-3', '2.5', ' 7 '])('accepts %j', value => {
    expect(numberHint(operator, value)).toBeUndefined()
  })

  it.each(['abc', '12w', '1,5', '5 5'])('asks for a number when %j is not one', value => {
    expect(numberHint(operator, value)).toBe('Enter a valid number')
  })

  it('says nothing while the value is still empty', () => {
    expect(numberHint(operator, '')).toBeUndefined()
    expect(numberHint(operator, '   ')).toBeUndefined()
  })
})

describe.each([
  ['equals', FilterOperator.EQUALS],
  ['not equals', FilterOperator.NOT_EQUALS],
  ['contains', FilterOperator.CONTAINS],
  ['not contains', FilterOperator.NOT_CONTAINS],
])('numberHint on %s', (_label, operator) => {
  it('leaves text operators alone', () => {
    expect(numberHint(operator, 'abc')).toBeUndefined()
  })
})

describe.each([
  ['between', FilterOperator.BETWEEN],
  ['not between', FilterOperator.NOT_BETWEEN],
])('rangeHint on %s', (_label, operator) => {
  it.each([
    ['5', '10'],
    ['5', '5'],
    ['-3', '2.5'],
    [' 5 ', ' 10 '],
  ])('accepts %s to %s', (min, max) => {
    expect(rangeHint(operator, min, max)).toBeUndefined()
  })

  it.each([
    ['', ''],
    ['5', ''],
    ['', '10'],
    ['  ', '10'],
  ])('says nothing while %j to %j is still being typed', (min, max) => {
    expect(rangeHint(operator, min, max)).toBeUndefined()
  })

  it('asks for min <= max when the range runs backwards', () => {
    expect(rangeHint(operator, '10', '5')).toBe("Min can't be above max")
    expect(rangeHint(operator, '-1', '-2')).toBe("Min can't be above max")
  })

  it.each([
    ['abc', '5'],
    ['5', 'abc'],
    ['abc', 'xyz'],
    ['1,5', '10'],
  ])('asks for numbers when %s to %s is not numeric', (min, max) => {
    expect(rangeHint(operator, min, max)).toBe('Enter valid numbers')
  })

  it('marks only the bound that is not a number', () => {
    expect(rangeInvalidBounds(operator, 'abc', '5')).toEqual({ min: true, max: false })
    expect(rangeInvalidBounds(operator, '5', 'abc')).toEqual({ min: false, max: true })
    expect(rangeInvalidBounds(operator, 'abc', 'xyz')).toEqual({ min: true, max: true })
  })

  it('marks both bounds when each is a number but they run backwards', () => {
    expect(rangeInvalidBounds(operator, '10', '5')).toEqual({ min: true, max: true })
  })

  it('marks nothing for a valid or half-typed range', () => {
    expect(rangeInvalidBounds(operator, '5', '10')).toEqual({ min: false, max: false })
    expect(rangeInvalidBounds(operator, '5', '')).toEqual({ min: false, max: false })
    expect(rangeInvalidBounds(operator, 'abc', '')).toEqual({ min: false, max: false })
  })
})
