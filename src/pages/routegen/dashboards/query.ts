import { create } from '@bufbuild/protobuf'
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
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { fromProtoFilter, toProtoFilters } from '@/components/event-filters/filter-proto'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { createEntry } from '@/hooks/use-event-filters'
import { tsToDate } from '@/lib/timestamp'
import { NUMERIC_AGGREGATIONS } from '../insights/constants'
import {
  buildUserFlowQuery,
  DEFAULT_USER_FLOW_CONFIG,
  parseUserFlowConfig,
  type UserFlowConfig,
} from '../insights/user-flow'
import { BREAKDOWN_RESPONSE_LIMIT } from './constants'

export type InsightEditorState = {
  displayName: string
  description: string
  insightType: InsightType
  eventEntries: EventFilterEntry[]
  propFilters: ActiveFilter[]
  breakdowns: string[]
  userFlowConfig: UserFlowConfig
}

export const getProtoRange = (range?: ProtoTimeRange) => {
  const from = tsToDate(range?.from)
  const to = tsToDate(range?.to)
  if (!from || !to) return undefined
  return { from, to }
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
    spec?.insightType === InsightType.RETENTION ||
    spec?.insightType === InsightType.USER_FLOW
  ) {
    return spec.insightType
  }
  return InsightType.TRENDS
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
    userFlowConfig: parseUserFlowConfig(spec?.userFlow),
  }
}

export const buildInsightSpec = ({
  insightType,
  validEntries,
  propFilters,
  breakdowns,
  userFlowConfig = DEFAULT_USER_FLOW_CONFIG,
}: {
  insightType: InsightType
  validEntries: EventFilterEntry[]
  propFilters: ActiveFilter[]
  breakdowns: string[]
  userFlowConfig?: UserFlowConfig
}) => {
  const isUserFlow = insightType === InsightType.USER_FLOW
  return create(InsightQuerySpecSchema, {
    insightType,
    events: isUserFlow
      ? []
      : validEntries.map(entry => ({
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
    userFlow: isUserFlow ? buildUserFlowQuery(userFlowConfig) : undefined,
    breakdowns: isUserFlow ? [] : breakdowns.map(property => ({ property })),
    breakdownLimit: isUserFlow || breakdowns.length === 0 ? 0 : BREAKDOWN_RESPONSE_LIMIT,
    filterGroups:
      propFilters.length > 0 ? [{ filters: toProtoFilters(propFilters), operator: LogicalOperator.AND }] : [],
    filterGroupsOperator: LogicalOperator.AND,
    includeStepTiming: false,
  })
}
