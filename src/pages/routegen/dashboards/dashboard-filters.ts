import { create, createRegistry } from '@bufbuild/protobuf'
import { createValidator } from '@bufbuild/protovalidate'
import {
  type GetFilterSchemaResponse,
  type PropertyKeyMeta,
  PropertySource,
} from '@/api/genproto/common/v1/filter_schema_pb'
import { file_common_v1_filters, LogicalOperator, PropertyFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  FilterGroupSchema,
  type InsightQuerySpec,
  InsightQuerySpecSchema,
  TopKQuery_Dimension,
  UserFlowQuery_NodeKind,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import { COUNTRY_PROPERTY } from './activity-map'

const validator = createValidator({ registry: createRegistry(file_common_v1_filters) })

// The transport refuses a whole request over one invalid filter, so a bad dashboard filter would fail every tile.
export const filterViolation = (filter: ActiveFilter) => {
  const result = validator.validate(PropertyFilterSchema, create(PropertyFilterSchema, toProtoFilters([filter])[0]))
  if (result.kind === 'invalid') return result.violations[0].message
  return result.error?.message
}

const scopedQuery = (spec: InsightQuerySpec) => spec.session ?? spec.userFlow ?? spec.topK ?? spec.map

// Unscoped tiles add no kinds: intersecting every project event costs a request each and leaves almost nothing.
export const dashboardEventKinds = (tiles: DashboardTile[]) => {
  const kinds = tiles.flatMap(tile => {
    if (tile.content.case !== 'insight' || !tile.content.value.spec) return []
    const spec = tile.content.value.spec
    const scoped = scopedQuery(spec)
    if (scoped) return [scoped.scope?.kind ?? '']
    return spec.events.map(entry => entry.event?.kind ?? '')
  })
  return [...new Set(kinds.filter(Boolean))].sort()
}

export const commonDashboardSchema = (base: GetFilterSchemaResponse, schemas: GetFilterSchemaResponse[]) => {
  if (schemas.length === 0) return base
  const common = (select: (schema: GetFilterSchemaResponse) => PropertyKeyMeta[]) =>
    select(schemas[0]).filter(key =>
      schemas.every(schema =>
        select(schema).some(other => other.name === key.name && other.valueType === key.valueType),
      ),
    )
  return {
    ...base,
    autoPropertyKeys: common(schema => schema.autoPropertyKeys),
    customPropertyKeys: common(schema => schema.customPropertyKeys),
  }
}

const ownFilters = (spec: InsightQuerySpec) => [
  ...spec.filterGroups.flatMap(group => group.filters),
  ...spec.events.flatMap(entry => entry.event?.filters ?? []),
  ...(scopedQuery(spec)?.scope?.filters ?? []),
]

const splitProperties = (spec: InsightQuerySpec) => {
  const properties = spec.breakdowns.map(breakdown => breakdown.property)
  if (spec.topK?.dimension === TopKQuery_Dimension.PROPERTY) properties.push(spec.topK.property)
  if (spec.userFlow?.nodeKind === UserFlowQuery_NodeKind.PROPERTY) properties.push(spec.userFlow.nodeProperty)
  if (spec.map) properties.push(COUNTRY_PROPERTY)
  return properties
}

// Auto, custom and unspecified sources all name the same event property; only profile traits are separate.
const isProfile = (source: PropertySource) => source === PropertySource.PROFILE

export const dashboardFilterOverlap = (spec: InsightQuerySpec | undefined, filters: readonly ActiveFilter[]) => {
  if (!spec) return { filters: [], splits: [] }
  const isFiltered = (property: string, source = PropertySource.UNSPECIFIED) =>
    filters.some(filter => filter.property === property && isProfile(filter.source) === isProfile(source))
  return {
    filters: ownFilters(spec).filter(filter => isFiltered(filter.property, filter.source)),
    splits: splitProperties(spec).filter(property => isFiltered(property)),
  }
}

export const applyDashboardFilters = (spec: InsightQuerySpec | undefined, filters: readonly ActiveFilter[]) => {
  if (!spec || filters.length === 0) return spec
  const dashboardFilters = toProtoFilters(filters)
  const groups = spec.filterGroups.filter(group => group.filters.length > 0)
  // Another group under an outer OR would make the dashboard filters optional, so distribute them:
  // (A OR B) AND D becomes (A AND D) OR (B AND D).
  if (spec.filterGroupsOperator === LogicalOperator.OR && groups.length > 0) {
    return create(InsightQuerySpecSchema, {
      ...spec,
      filterGroups: groups.flatMap(group => {
        const terms = group.operator === LogicalOperator.OR ? group.filters.map(filter => [filter]) : [group.filters]
        return terms.map(term =>
          create(FilterGroupSchema, { operator: LogicalOperator.AND, filters: [...term, ...dashboardFilters] }),
        )
      }),
    })
  }
  return create(InsightQuerySpecSchema, {
    ...spec,
    filterGroupsOperator: LogicalOperator.AND,
    filterGroups: [...groups, create(FilterGroupSchema, { operator: LogicalOperator.AND, filters: dashboardFilters })],
  })
}
