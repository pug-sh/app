import { describe, expect, it } from 'vitest'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { UserFlowQuery_GroupBy, UserFlowQuery_NodeKind } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsEventFiltersSearch, readFilterQueryParams, readIncludeBotsParam } from './use-filter-query-params'

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

// Switching the node kind to Property opens the picker before anything is selected, and that
// half-configured state is written straight to the URL. Restoring used to run the *runnable*
// schema over it, fail, and fall back to defaults — so a reload silently discarded the scope
// event and its filters, and said nothing.
describe('user-flow config restore', () => {
  const scopeFilter = {
    property: '$os',
    source: PropertySource.AUTO,
    operator: FilterOperator.EQUALS,
    kind: 'single',
    value: 'mac',
  }
  const search = (config: unknown) => `?it=5&uf=${encodeURIComponent(JSON.stringify(config))}`

  it('keeps the scope and filters of a config that is not runnable yet', () => {
    const { userFlowConfig, parseWarning } = readFilterQueryParams(
      search({
        nodeKind: UserFlowQuery_NodeKind.PROPERTY,
        nodeProperty: '',
        groupBy: UserFlowQuery_GroupBy.SESSION,
        scope: { kind: 'page_view', filters: [scopeFilter] },
      }),
    )

    expect(userFlowConfig.nodeKind).toBe(UserFlowQuery_NodeKind.PROPERTY)
    expect(userFlowConfig.scope.kind).toBe('page_view')
    expect(userFlowConfig.scope.filters).toHaveLength(1)
    expect(parseWarning).toBeNull()
  })

  it('normalizes enums the URL should never have carried', () => {
    const { userFlowConfig } = readFilterQueryParams(
      search({
        nodeKind: UserFlowQuery_NodeKind.UNSPECIFIED,
        nodeProperty: '',
        groupBy: UserFlowQuery_GroupBy.UNSPECIFIED,
        scope: { kind: '  page_view  ', filters: [] },
      }),
    )

    expect(userFlowConfig.nodeKind).toBe(UserFlowQuery_NodeKind.EVENT_KIND)
    expect(userFlowConfig.groupBy).toBe(UserFlowQuery_GroupBy.SESSION)
    expect(userFlowConfig.scope.kind).toBe('page_view')
  })

  it('rejects a filter whose payload does not match its kind, and says so', () => {
    // `multi` with no `values` reached toProtoFilters and produced a filter message with an
    // undefined field — a query that is quietly wrong rather than refused.
    const { userFlowConfig, parseWarning } = readFilterQueryParams(
      search({
        nodeKind: UserFlowQuery_NodeKind.EVENT_KIND,
        nodeProperty: '',
        groupBy: UserFlowQuery_GroupBy.SESSION,
        scope: { kind: 'page_view', filters: [{ ...scopeFilter, kind: 'multi', value: undefined }] },
      }),
    )

    expect(userFlowConfig.scope.kind).toBe('')
    expect(parseWarning).toContain('user flow')
  })
})

// Only `1` opts in. A "generalisation" to `!== '0'` would flip every link that omits the param —
// which is every default-view link, since the writer only emits the opt-in.
describe('readIncludeBotsParam', () => {
  it.each([
    ['?bots=1', true],
    ['', false],
    ['?bots=0', false],
    ['?bots=true', false],
  ])('reads %s as %s', (search, expected) => {
    expect(readIncludeBotsParam(search)).toBe(expected)
  })
})
