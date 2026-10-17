import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import {
  GetFilterSchemaResponseSchema,
  PropertySource,
  PropertyValueType,
} from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator, LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import { DashboardTileSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  type InsightQuerySpec,
  InsightQuerySpecSchema,
  TopKQuery_Dimension,
  UserFlowQuery_NodeKind,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { createFilter } from '@/components/event-filters/filter-model'
import {
  applyDashboardFilters,
  commonDashboardSchema,
  dashboardEventKinds,
  dashboardFilterOverlap,
  filterViolation,
} from './dashboard-filters'

const tenant = createFilter('tenant', PropertySource.PROFILE, FilterOperator.IN, ['acme', 'other'])
const plan = createFilter('plan', PropertySource.PROFILE, FilterOperator.EQUALS, 'pro')
const tile = (fields: Parameters<typeof create<typeof InsightQuerySpecSchema>>[1]) =>
  create(DashboardTileSchema, {
    content: { case: 'insight', value: { spec: create(InsightQuerySpecSchema, fields) } },
  })

describe('dashboard filter composition', () => {
  // UNSPECIFIED combines as AND, as on the backend. An empty group never reaches the backend
  // (min_items), so it counts as absent.
  const evaluate = (spec: InsightQuerySpec, values: Record<string, boolean>) => {
    const groups = spec.filterGroups
      .filter(group => group.filters.length > 0)
      .map(group => {
        const predicates = group.filters.map(filter => values[filter.property ?? ''])
        return group.operator === LogicalOperator.OR ? predicates.some(Boolean) : predicates.every(Boolean)
      })
    if (groups.length === 0) return true
    return spec.filterGroupsOperator === LogicalOperator.OR ? groups.some(Boolean) : groups.every(Boolean)
  }

  it.each([
    ['AND', LogicalOperator.AND],
    ['OR', LogicalOperator.OR],
    ['UNSPECIFIED', LogicalOperator.UNSPECIFIED],
  ])('requires every dashboard filter in addition to the saved groups (outer %s)', (_, outer) => {
    const spec = create(InsightQuerySpecSchema, {
      filterGroupsOperator: outer,
      filterGroups: [
        { operator: LogicalOperator.OR, filters: [{ property: 'a' }, { property: 'b' }] },
        { operator: LogicalOperator.UNSPECIFIED, filters: [{ property: 'c' }, { property: 'd' }] },
        { operator: LogicalOperator.AND, filters: [] },
      ],
      events: [{ event: { kind: 'purchase', filters: [{ property: 'amount', value: '100' }] } }],
    })
    const before = structuredClone(spec)
    const filtered = applyDashboardFilters(spec, [tenant, plan])!
    const keys = ['a', 'b', 'c', 'd', 'tenant', 'plan']
    for (let mask = 0; mask < 2 ** keys.length; mask++) {
      const values = Object.fromEntries(keys.map((key, i) => [key, Boolean(mask & (1 << i))]))
      expect(evaluate(filtered, values)).toBe(evaluate(spec, values) && values.tenant && values.plan)
    }
    expect(filtered.filterGroups.every(group => group.filters.length > 0)).toBe(true)
    expect(spec).toEqual(before)
    expect(filtered.events).toEqual(spec.events)
  })

  it('restores the original spec when cleared and filters a spec without saved groups', () => {
    const spec = create(InsightQuerySpecSchema)
    expect(applyDashboardFilters(spec, [])).toBe(spec)
    expect(applyDashboardFilters(undefined, [tenant])).toBeUndefined()
    const filtered = applyDashboardFilters(
      create(InsightQuerySpecSchema, { filterGroupsOperator: LogicalOperator.OR }),
      [tenant],
    )
    expect(filtered?.filterGroupsOperator).toBe(LogicalOperator.AND)
    expect(filtered?.filterGroups[0].filters[0]).toMatchObject({
      property: 'tenant',
      source: PropertySource.PROFILE,
      values: ['acme', 'other'],
    })
  })

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

describe('shared dashboard properties', () => {
  it('intersects names and types separately for auto/custom properties and keeps profile traits', () => {
    const base = create(GetFilterSchemaResponseSchema, { profilePropertyKeys: [{ name: 'tenant' }] })
    const first = create(GetFilterSchemaResponseSchema, {
      autoPropertyKeys: [{ name: '$browser' }, { name: '$pathname' }],
      customPropertyKeys: [
        { name: 'shared' },
        { name: 'drift', valueType: PropertyValueType.INTEGER },
        { name: '$browser' },
      ],
    })
    const second = create(GetFilterSchemaResponseSchema, {
      autoPropertyKeys: [{ name: '$browser' }],
      customPropertyKeys: [{ name: 'shared' }, { name: 'drift', valueType: PropertyValueType.STRING }],
    })
    const schema = commonDashboardSchema(base, [first, second])
    expect(schema.autoPropertyKeys.map(key => key.name)).toEqual(['$browser'])
    expect(schema.customPropertyKeys.map(key => key.name)).toEqual(['shared'])
    expect(schema.profilePropertyKeys.map(key => key.name)).toEqual(['tenant'])
  })

  it('offers the whole base schema when no tile is scoped to an event', () => {
    const base = create(GetFilterSchemaResponseSchema, { customPropertyKeys: [{ name: 'plan' }] })
    expect(commonDashboardSchema(base, [])).toBe(base)
  })

  it('collects every scoped event kind and leaves unscoped tiles out', () => {
    const tiles = [
      tile({ events: [{ event: { kind: 'signup' } }, { event: { kind: 'purchase' } }] }),
      tile({ session: { scope: { kind: 'page_view' } } }),
      tile({ topK: { scope: { kind: 'rank' } } }),
      tile({ map: { scope: { kind: 'visit' } } }),
      tile({ userFlow: { scope: { kind: 'flow' } } }),
      tile({ session: {} }),
      tile({ topK: {} }),
      create(DashboardTileSchema, { content: { case: 'markdown', value: { body: 'text' } } }),
    ]
    expect(dashboardEventKinds(tiles)).toEqual(['flow', 'page_view', 'purchase', 'rank', 'signup', 'visit'])
  })
})

describe('dashboard filter overlap', () => {
  const browser = createFilter('$browser', PropertySource.AUTO, FilterOperator.EQUALS, 'Safari')
  const chrome = { property: '$browser', operator: FilterOperator.EQUALS, value: 'Chrome' }
  const spec = (fields: Parameters<typeof create<typeof InsightQuerySpecSchema>>[1]) =>
    create(InsightQuerySpecSchema, fields)

  it.each([
    ['saved filter groups', spec({ filterGroups: [{ filters: [{ property: 'plan', value: 'pro' }, chrome] }] })],
    ['event filters', spec({ events: [{ event: { kind: 'signup', filters: [chrome] } }] })],
    ['a session scope', spec({ session: { scope: { filters: [chrome] } } })],
    ['a top-K scope', spec({ topK: { scope: { filters: [chrome] } } })],
    ['a map scope', spec({ map: { scope: { filters: [chrome] } } })],
    ['a user-flow scope', spec({ userFlow: { scope: { filters: [chrome] } } })],
  ])('finds the tile filter on a dashboard-filtered property in %s', (_, tileSpec) => {
    expect(dashboardFilterOverlap(tileSpec, [browser]).filters.map(filter => filter.value)).toEqual(['Chrome'])
  })

  it('matches event properties across sources, and profile traits only with each other', () => {
    const own = spec({
      filterGroups: [
        {
          filters: [
            { property: 'plan', source: PropertySource.CUSTOM, value: 'free' },
            { property: 'tenant', source: PropertySource.CUSTOM, value: 'acme' },
            { property: 'tenant', source: PropertySource.PROFILE, value: 'acme' },
          ],
        },
      ],
    })
    const filters = [createFilter('plan', PropertySource.UNSPECIFIED, FilterOperator.EQUALS, 'pro'), tenant]
    expect(dashboardFilterOverlap(own, filters).filters.map(filter => [filter.property, filter.source])).toEqual([
      ['plan', PropertySource.CUSTOM],
      ['tenant', PropertySource.PROFILE],
    ])
  })

  it('finds splits on a dashboard-filtered property', () => {
    const country = createFilter('$country', PropertySource.AUTO, FilterOperator.EQUALS, 'US')
    const splits = (tileSpec: InsightQuerySpec) => dashboardFilterOverlap(tileSpec, [browser, country]).splits
    expect(splits(spec({ breakdowns: [{ property: '$os' }, { property: '$browser' }] }))).toEqual(['$browser'])
    expect(splits(spec({ topK: { dimension: TopKQuery_Dimension.PROPERTY, property: '$browser' } }))).toEqual([
      '$browser',
    ])
    expect(splits(spec({ topK: { dimension: TopKQuery_Dimension.EVENT_KIND, property: '$browser' } }))).toEqual([])
    expect(splits(spec({ userFlow: { nodeKind: UserFlowQuery_NodeKind.PROPERTY, nodeProperty: '$browser' } }))).toEqual(
      ['$browser'],
    )
    expect(splits(spec({ map: {} }))).toEqual(['$country'])
  })

  it('finds nothing without dashboard filters or a spec', () => {
    const own = spec({ filterGroups: [{ filters: [chrome] }], breakdowns: [{ property: '$browser' }] })
    expect(dashboardFilterOverlap(own, [])).toEqual({ filters: [], splits: [] })
    expect(dashboardFilterOverlap(undefined, [browser])).toEqual({ filters: [], splits: [] })
  })
})
