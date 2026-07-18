import { describe, expect, it } from 'vitest'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator, LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import { createFilter } from '@/components/event-filters/filter-model'
import {
  filterChips,
  filterGroupFields,
  filtersExcept,
  filterValueLabel,
  filterValues,
  hasFilter,
  removeFilter,
  toggleFilter,
  toggleSingleFilter,
} from './web-filters'

const AUTO = PropertySource.AUTO
const single = (property: string, value: string) => createFilter(property, AUTO, FilterOperator.EQUALS, value)
const multi = (property: string, values: string[]) => createFilter(property, AUTO, FilterOperator.IN, values)

describe('toggleFilter', () => {
  it('adds a single EQUALS filter, and toggling the same value clears it', () => {
    const once = toggleFilter([], '$browser', 'Chrome')
    expect(once).toEqual([single('$browser', 'Chrome')])
    expect(toggleFilter(once, '$browser', 'Chrome')).toEqual([])
  })

  it('upgrades a second same-property value to IN, and downgrades back to EQUALS', () => {
    const two = toggleFilter(toggleFilter([], '$country', 'IN'), '$country', 'US')
    expect(two).toEqual([multi('$country', ['IN', 'US'])])
    expect(toggleFilter(two, '$country', 'IN')).toEqual([single('$country', 'US')])
  })

  it('keeps different properties as separate filters', () => {
    const filters = toggleFilter(toggleFilter([], '$country', 'IN'), '$browser', 'Chrome')
    expect(filters).toEqual([single('$country', 'IN'), single('$browser', 'Chrome')])
  })
})

describe('toggleSingleFilter', () => {
  it('sets a single EQUALS filter when the property is unset', () => {
    expect(toggleSingleFilter([], '$country', 'IN')).toEqual([single('$country', 'IN')])
  })

  it('replaces the current value instead of accumulating an IN list', () => {
    const one = toggleSingleFilter([], '$country', 'IN')
    expect(toggleSingleFilter(one, '$country', 'US')).toEqual([single('$country', 'US')])
  })

  it('clears the filter when its sole value is re-selected', () => {
    const one = toggleSingleFilter([], '$country', 'IN')
    expect(toggleSingleFilter(one, '$country', 'IN')).toEqual([])
  })

  it('collapses a pre-existing multi filter down to the clicked value', () => {
    expect(toggleSingleFilter([multi('$country', ['IN', 'US'])], '$country', 'AU')).toEqual([single('$country', 'AU')])
  })

  it('leaves other properties untouched', () => {
    expect(toggleSingleFilter([single('$browser', 'Chrome')], '$country', 'IN')).toEqual([
      single('$browser', 'Chrome'),
      single('$country', 'IN'),
    ])
  })
})

describe('hasFilter / filterValues / removeFilter / filtersExcept', () => {
  const filters = [multi('$country', ['IN', 'US']), single('$browser', 'Chrome')]

  it('hasFilter checks value membership', () => {
    expect(hasFilter(filters, '$country', 'US')).toBe(true)
    expect(hasFilter(filters, '$country', 'FR')).toBe(false)
    expect(hasFilter(filters, '$os', 'iOS')).toBe(false)
  })

  it('filterValues returns the selected values for a property, empty when unset', () => {
    expect(filterValues(filters, '$country')).toEqual(['IN', 'US'])
    expect(filterValues(filters, '$os')).toEqual([])
  })

  it('removeFilter drops one value, downgrading IN→EQUALS', () => {
    expect(removeFilter(filters, '$country', 'IN')).toEqual([single('$country', 'US'), single('$browser', 'Chrome')])
  })

  it('filtersExcept drops a whole property', () => {
    expect(filtersExcept(filters, '$country')).toEqual([single('$browser', 'Chrome')])
    expect(filtersExcept(filters, undefined)).toEqual(filters)
  })
})

describe('filterChips', () => {
  it('expands a multi filter into one chip per value', () => {
    expect(filterChips([multi('$country', ['IN', 'US']), single('$browser', 'Chrome')])).toEqual([
      { property: '$country', value: 'IN' },
      { property: '$country', value: 'US' },
      { property: '$browser', value: 'Chrome' },
    ])
  })
})

describe('filterGroupFields', () => {
  it('produces no groups when empty', () => {
    expect(filterGroupFields([])).toEqual({ filterGroups: [], filterGroupsOperator: LogicalOperator.AND })
  })

  it('wraps toProtoFilters in a single AND group (EQUALS single, IN multi)', () => {
    const { filterGroups, filterGroupsOperator } = filterGroupFields([
      multi('$country', ['IN', 'US']),
      single('$browser', 'Chrome'),
    ])
    expect(filterGroupsOperator).toBe(LogicalOperator.AND)
    expect(filterGroups).toHaveLength(1)
    expect(filterGroups[0].operator).toBe(LogicalOperator.AND)
    expect(filterGroups[0].filters).toEqual([
      { property: '$country', source: AUTO, operator: FilterOperator.IN, value: '', values: ['IN', 'US'] },
      { property: '$browser', source: AUTO, operator: FilterOperator.EQUALS, value: 'Chrome', values: [] },
    ])
  })
})

describe('filterValueLabel', () => {
  it('renders a $country ISO code as its country name', () => {
    expect(filterValueLabel('$country', 'US')).toBe('United States')
    expect(filterValueLabel('$country', 'IN')).toBe('India')
  })

  it('leaves other properties untouched', () => {
    expect(filterValueLabel('$browser', 'Chrome')).toBe('Chrome')
    expect(filterValueLabel('$utmSource', 'google')).toBe('google')
  })
})
