import { describe, expect, it } from 'vitest'
import { insightsEventFiltersSearch, readFilterQueryParams } from './use-filter-query-params'

// The Overview events drill-through builds an Insights `?ef=…` with insightsEventFiltersSearch and
// relies on the Insights page reading it straight back via readFilterQueryParams. Guard that contract.
describe('insightsEventFiltersSearch → readFilterQueryParams round-trip', () => {
  it('preloads the given event kinds as bare event rows, in order', () => {
    const { eventFilters, parseWarning } = readFilterQueryParams(
      `?${insightsEventFiltersSearch(['signup', 'purchase'])}`,
    )
    expect(eventFilters.map(entry => entry.kind)).toEqual(['signup', 'purchase'])
    expect(eventFilters.every(entry => entry.filters.length === 0)).toBe(true)
    expect(parseWarning).toBeNull()
  })

  it('round-trips a single event (the drill-through call shape)', () => {
    expect(
      readFilterQueryParams(`?${insightsEventFiltersSearch(['page_view'])}`).eventFilters.map(e => e.kind),
    ).toEqual(['page_view'])
  })
})
