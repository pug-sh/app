import { create } from '@bufbuild/protobuf'
import {
  AggregationType,
  type InsightQuerySpec,
  type TopKQuery,
  TopKQuery_Dimension,
  TopKQuerySchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { NUMERIC_AGGREGATIONS } from './constants'

// Editor state for a top-k insight. The optional event scope is not part of
// this state — it rides on the shared event-filters entries (capped at 1).
export type TopKState = {
  dimension: TopKQuery_Dimension
  property: string
  metric: AggregationType
  metricProperty: string
  limit: number
}

export const TOP_K_DIMENSIONS = [
  { label: 'Events', value: TopKQuery_Dimension.EVENT_KIND },
  { label: 'Property values', value: TopKQuery_Dimension.PROPERTY },
  { label: 'Users', value: TopKQuery_Dimension.USER },
] as const

const TOP_K_DIMENSION_VALUES = TOP_K_DIMENSIONS.map(x => x.value) as TopKQuery_Dimension[]

// CEL caps limit at 100.
export const TOP_K_LIMITS = [
  { label: 'Top 5', value: 5 },
  { label: 'Top 10', value: 10 },
  { label: 'Top 20', value: 20 },
  { label: 'Top 50', value: 50 },
  { label: 'Top 100', value: 100 },
] as const

const TOP_K_LIMIT_VALUES = TOP_K_LIMITS.map(x => x.value) as number[]

// UNIQUE_USERS / PER_USER_AVG are degenerate when each group is a single user;
// the backend rejects them for DIMENSION_USER.
export const TOP_K_USER_FORBIDDEN_METRICS = new Set([AggregationType.UNIQUE_USERS, AggregationType.PER_USER_AVG])

export const DEFAULT_TOP_K: TopKState = {
  dimension: TopKQuery_Dimension.EVENT_KIND,
  property: '',
  metric: AggregationType.TOTAL,
  metricProperty: '',
  limit: 10,
}

// Works for both TopKState and the TopKQuery proto message (same field names).
export const topKIncompleteReason = (topK: Pick<TopKState, 'dimension' | 'property' | 'metric' | 'metricProperty'>) => {
  if (topK.dimension === TopKQuery_Dimension.PROPERTY && !topK.property.trim()) {
    return 'Select a property to rank'
  }
  if (NUMERIC_AGGREGATIONS.has(topK.metric) && !topK.metricProperty.trim()) {
    return 'Select a numeric property for this measure'
  }
  return null
}

// Null when the spec is a runnable top-k query; otherwise the reason it isn't.
export const topKSpecIncompleteReason = (spec?: InsightQuerySpec) => {
  if (!spec?.topK) return 'Configure the ranking to start'
  return topKIncompleteReason(spec.topK)
}

export const buildTopKQuery = (topK: TopKState, scope?: EventFilterEntry): TopKQuery =>
  create(TopKQuerySchema, {
    dimension: topK.dimension,
    property: topK.dimension === TopKQuery_Dimension.PROPERTY ? topK.property : '',
    scope: scope ? { kind: scope.kind, filters: toProtoFilters(scope.filters) } : undefined,
    metric: topK.metric,
    metricProperty: NUMERIC_AGGREGATIONS.has(topK.metric) ? topK.metricProperty : '',
    limit: topK.limit,
  })

const normalizeMetric = (dimension: TopKQuery_Dimension, metric: AggregationType) => {
  if (dimension === TopKQuery_Dimension.USER && TOP_K_USER_FORBIDDEN_METRICS.has(metric)) {
    return AggregationType.TOTAL
  }
  return metric
}

// Coerce untrusted input (URL params, saved specs) into a valid TopKState,
// falling back to defaults field by field.
export const normalizeTopKState = (raw: {
  dimension?: unknown
  property?: unknown
  metric?: unknown
  metricProperty?: unknown
  limit?: unknown
}): TopKState => {
  const dimension =
    typeof raw.dimension === 'number' && TOP_K_DIMENSION_VALUES.includes(raw.dimension)
      ? (raw.dimension as TopKQuery_Dimension)
      : DEFAULT_TOP_K.dimension
  const metric =
    typeof raw.metric === 'number' && AggregationType[raw.metric] !== undefined && raw.metric !== 0
      ? (raw.metric as AggregationType)
      : DEFAULT_TOP_K.metric
  return {
    dimension,
    property: typeof raw.property === 'string' ? raw.property.trim() : '',
    metric: normalizeMetric(dimension, metric),
    metricProperty: typeof raw.metricProperty === 'string' ? raw.metricProperty.trim() : '',
    limit: typeof raw.limit === 'number' && TOP_K_LIMIT_VALUES.includes(raw.limit) ? raw.limit : DEFAULT_TOP_K.limit,
  }
}

export const parseTopKFromSpec = (spec?: InsightQuerySpec): TopKState => {
  if (!spec?.topK) return DEFAULT_TOP_K
  return normalizeTopKState(spec.topK)
}
