import { create } from '@bufbuild/protobuf'
import type { PropertyFilter } from '@/api/genproto/common/v1/filters_pb'
import { LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import type { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { type TimeRange as ProtoTimeRange, TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  Granularity,
  InsightType,
  type QueryRequest,
  QueryRequestSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { type ActiveFilter, FILTER_OPERATORS } from '@/components/event-filters/filter-model'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { createEntry } from '@/hooks/use-event-filters'
import { DEFAULT_DASHBOARD_TIME_RANGE_PRESET, INSIGHTS_PRESETS, isDashboardTimeRangePreset } from '@/lib/date-presets'
import { toProtoTimeRange, tsToDate } from '@/lib/timestamp'
import { NUMERIC_AGGREGATIONS } from '../insights/constants'
import { BREAKDOWN_RESPONSE_LIMIT } from './constants'

export type InsightEditorState = {
  displayName: string
  description: string
  defaultTimeRange: TimeRangePreset
  timeRange: TimeRange | undefined
  insightType: InsightType
  granularity: Granularity
  eventEntries: EventFilterEntry[]
  propFilters: ActiveFilter[]
  breakdowns: string[]
}

export const getDefaultTimeRange = () => INSIGHTS_PRESETS[0].resolve()

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

export const parseQueryEntries = (query?: QueryRequest) =>
  (query?.events ?? []).map(entry =>
    createEntry(entry.event?.kind ?? '', {
      filters: (entry.event?.filters ?? []).map(filter => fromProtoFilter(filter)),
      aggregation: entry.aggregation,
      aggregationProperty: entry.aggregationProperty,
    }),
  )

export const parseQueryPropFilters = (query?: QueryRequest) =>
  (query?.filterGroups ?? []).flatMap(group => group.filters.map(filter => fromProtoFilter(filter)))

export const parseQueryBreakdowns = (query?: QueryRequest) =>
  (query?.breakdowns ?? []).map(item => item.property).filter(Boolean)

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

export const getInitialDefaultTimeRange = (tile?: DashboardTile) => {
  const preset = tile?.defaultTimeRange
  return isDashboardTimeRangePreset(preset) ? preset : DEFAULT_DASHBOARD_TIME_RANGE_PRESET
}

export const getInitialInsightType = (query?: QueryRequest) => {
  if (
    query?.insightType === InsightType.TRENDS ||
    query?.insightType === InsightType.FUNNEL ||
    query?.insightType === InsightType.RETENTION
  ) {
    return query.insightType
  }
  return InsightType.TRENDS
}

export const getInsightEditorDefaults = (tile?: DashboardTile): InsightEditorState => {
  const query = tile?.content.case === 'insight' ? tile.content.value.query : undefined
  return {
    displayName: tile?.displayName ?? '',
    description: tile?.description ?? '',
    defaultTimeRange: getInitialDefaultTimeRange(tile),
    timeRange: getProtoRange(query?.timeRange) ?? getDefaultTimeRange(),
    insightType: getInitialInsightType(query),
    granularity: getInitialGranularity(query),
    eventEntries: parseQueryEntries(query),
    propFilters: parseQueryPropFilters(query),
    breakdowns: parseQueryBreakdowns(query),
  }
}

export const buildInsightQuery = ({
  insightType,
  granularity,
  timeRange,
  validEntries,
  propFilters,
  breakdowns,
}: {
  insightType: InsightType
  granularity: Granularity
  timeRange: TimeRange | undefined
  validEntries: EventFilterEntry[]
  propFilters: ActiveFilter[]
  breakdowns: string[]
}) =>
  create(QueryRequestSchema, {
    insightType,
    granularity,
    timeRange: timeRange ? create(TimeRangeSchema, toProtoTimeRange(timeRange)) : undefined,
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
