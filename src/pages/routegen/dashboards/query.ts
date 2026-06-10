import { create } from '@bufbuild/protobuf'
import type { PropertyFilter } from '@/api/genproto/common/v1/filters_pb'
import { LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import type { TimeRange as ProtoTimeRange } from '@/api/genproto/common/v1/time_pb'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  Granularity,
  type InsightQuerySpec,
  InsightQuerySpecSchema,
  InsightType,
  type QueryRequest,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { type ActiveFilter, FILTER_OPERATORS } from '@/components/event-filters/filter-model'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { createEntry } from '@/hooks/use-event-filters'
import { tsToDate } from '@/lib/timestamp'
import { isIncompleteNumericAggregation, NUMERIC_AGGREGATIONS } from '../insights/constants'
import { BREAKDOWN_RESPONSE_LIMIT } from './constants'

export type InsightEditorState = {
  displayName: string
  description: string
  insightType: InsightType
  eventEntries: EventFilterEntry[]
  propFilters: ActiveFilter[]
  breakdowns: string[]
}

export const getProtoRange = (range?: ProtoTimeRange) => {
  const from = tsToDate(range?.from)
  const to = tsToDate(range?.to)
  if (!from || !to) return undefined
  return { from, to }
}

export const fromProtoFilter = (filter: PropertyFilter): ActiveFilter => {
  const property = filter.property ?? ''
  const source = filter.source
  const operator = filter.operator
  const arity = FILTER_OPERATORS.find(option => option.value === operator)?.arity
  const values = filter.values ?? []

  if (arity === 'none') {
    return { property, source, operator, kind: 'presence' }
  }
  if (arity === 'range') {
    return { property, source, operator, kind: 'range', min: values[0] ?? '', max: values[1] ?? '' }
  }
  if (arity === 'list') {
    return { property, source, operator, kind: 'multi', values }
  }
  return { property, source, operator, kind: 'single', value: filter.value ?? '' }
}

export const parseSpecEntries = (spec?: InsightQuerySpec) =>
  (spec?.events ?? []).map(entry =>
    createEntry(entry.event?.kind ?? '', {
      filters: (entry.event?.filters ?? []).map(filter => fromProtoFilter(filter)),
      aggregation: entry.aggregation,
      aggregationProperty: entry.aggregationProperty,
    }),
  )

export const parseSpecPropFilters = (spec?: InsightQuerySpec) =>
  (spec?.filterGroups ?? []).flatMap(group => group.filters.map(filter => fromProtoFilter(filter)))

export const parseSpecBreakdowns = (spec?: InsightQuerySpec) =>
  (spec?.breakdowns ?? []).map(item => item.property).filter(Boolean)

// Read the granularity off a QueryRequest if it's one of the supported values, falling
// back to DAY otherwise. Load-bearing for the editor's live preview, where buildInsightSpec
// callers populate granularity directly on the wrapper QueryRequest; saved tiles always
// pass UNSPECIFIED here and fall through to DAY.
export const getInitialGranularity = (query?: QueryRequest) => {
  const granularity = query?.granularity
  if (
    granularity === Granularity.HOUR ||
    granularity === Granularity.DAY ||
    granularity === Granularity.WEEK ||
    granularity === Granularity.MONTH
  ) {
    return granularity
  }
  return Granularity.DAY
}

export const getInitialInsightType = (spec?: InsightQuerySpec) => {
  if (
    spec?.insightType === InsightType.TRENDS ||
    spec?.insightType === InsightType.FUNNEL ||
    spec?.insightType === InsightType.RETENTION
  ) {
    return spec.insightType
  }
  return InsightType.TRENDS
}

// True when a TRENDS spec has an event whose numeric aggregation (Sum/Avg/Min/Max)
// is missing the property it needs to resolve. Mirrors the Insights page guard so
// the tile doesn't fire an incomplete query.
export const specHasIncompleteNumericAggregation = (spec?: InsightQuerySpec) => {
  if (spec?.insightType !== InsightType.TRENDS) return false
  return (spec.events ?? []).some(entry => isIncompleteNumericAggregation(entry.aggregation, entry.aggregationProperty))
}

export const getInsightEditorDefaults = (tile?: DashboardTile): InsightEditorState => {
  const spec = tile?.content.case === 'insight' ? tile.content.value.spec : undefined
  return {
    displayName: tile?.displayName ?? '',
    description: tile?.description ?? '',
    insightType: getInitialInsightType(spec),
    eventEntries: parseSpecEntries(spec),
    propFilters: parseSpecPropFilters(spec),
    breakdowns: parseSpecBreakdowns(spec),
  }
}

export const buildInsightSpec = ({
  insightType,
  validEntries,
  propFilters,
  breakdowns,
}: {
  insightType: InsightType
  validEntries: EventFilterEntry[]
  propFilters: ActiveFilter[]
  breakdowns: string[]
}) =>
  create(InsightQuerySpecSchema, {
    insightType,
    events: validEntries.map(entry => ({
      event: {
        kind: entry.kind,
        filters: toProtoFilters(entry.filters),
      },
      aggregation:
        insightType === InsightType.TRENDS ? (entry.aggregation ?? AggregationType.TOTAL) : AggregationType.TOTAL,
      aggregationProperty:
        insightType === InsightType.TRENDS && NUMERIC_AGGREGATIONS.has(entry.aggregation ?? AggregationType.TOTAL)
          ? (entry.aggregationProperty ?? '')
          : '',
    })),
    breakdowns: breakdowns.map(property => ({ property })),
    breakdownLimit: breakdowns.length > 0 ? BREAKDOWN_RESPONSE_LIMIT : 0,
    filterGroups:
      propFilters.length > 0 ? [{ filters: toProtoFilters(propFilters), operator: LogicalOperator.AND }] : [],
    filterGroupsOperator: LogicalOperator.AND,
    includeStepTiming: false,
  })
