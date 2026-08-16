import { create } from '@bufbuild/protobuf'
import {
  AggregationType,
  type InsightQuerySpec,
  type MapQuery,
  MapQuerySchema,
  type TopKRow,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import type { CountryActivity } from '@/components/activity-map-view'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { AGGREGATIONS, NUMERIC_AGGREGATIONS } from './constants'

const VALID_METRICS = new Set<AggregationType>(AGGREGATIONS.map(a => a.value))

// Editor state for a map insight. There is no dimension to pick — the country is what makes this
// insight type a map — and no limit, since the country set is closed. Like top-k, the optional
// event scope rides on the shared event-filters entries (capped at 1) rather than living here.
export type MapState = {
  metric: AggregationType
  metricProperty: string
}

export const DEFAULT_MAP: MapState = {
  metric: AggregationType.TOTAL,
  metricProperty: '',
}

// Works for both MapState and the MapQuery proto message (same field names).
export const mapIncompleteReason = (map: Pick<MapState, 'metric' | 'metricProperty'>) => {
  if (NUMERIC_AGGREGATIONS.has(map.metric) && !map.metricProperty.trim()) {
    return 'Select a numeric property for this measure'
  }
  return null
}

// Null when the spec is a runnable map query; otherwise the reason it isn't.
export const mapSpecIncompleteReason = (spec?: InsightQuerySpec) => {
  if (!spec?.map) return 'Configure the map to start'
  return mapIncompleteReason(spec.map)
}

export const buildMapQuery = (map: MapState, scope?: EventFilterEntry): MapQuery =>
  create(MapQuerySchema, {
    scope: scope ? { kind: scope.kind, filters: toProtoFilters(scope.filters) } : undefined,
    metric: map.metric,
    metricProperty: NUMERIC_AGGREGATIONS.has(map.metric) ? map.metricProperty : '',
  })

// Coerce untrusted input (URL params, saved specs) into a valid MapState.
export const normalizeMapState = (raw: { metric?: unknown; metricProperty?: unknown }): MapState => {
  const metric =
    typeof raw.metric === 'number' && VALID_METRICS.has(raw.metric as AggregationType)
      ? (raw.metric as AggregationType)
      : DEFAULT_MAP.metric
  const metricProperty = typeof raw.metricProperty === 'string' ? raw.metricProperty.trim() : ''
  return {
    metric,
    metricProperty: NUMERIC_AGGREGATIONS.has(metric) ? metricProperty : '',
  }
}

export const parseMapFromSpec = (spec?: InsightQuerySpec): MapState => {
  if (!spec?.map) return DEFAULT_MAP
  return normalizeMapState(spec.map)
}

// A MAP insight answers in top-k rows keyed by ISO alpha-2 (the server rewrites it to a top-k over
// $country). is_others never appears — the map query omits the bucket — but it is filtered anyway
// rather than trusted, since a bucket row would resolve to no country and silently vanish.
export const countryCountsFromTopKRows = (rows: readonly TopKRow[]): CountryActivity[] =>
  rows
    .filter(row => !row.isOthers && row.dimensionValue && row.value > 0)
    .map(row => ({ iso: row.dimensionValue.toUpperCase(), count: row.value }))
    .sort((a, b) => b.count - a.count || a.iso.localeCompare(b.iso))
