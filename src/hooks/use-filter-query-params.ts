import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { AggregationType, Granularity, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { createEntry, serializeEntry } from '@/hooks/use-event-filters'
import { normalizeTopKState, type TopKState } from '@/pages/routegen/insights/top-k'
import {
  DEFAULT_USER_FLOW_CONFIG,
  parseSerializedUserFlowConfig,
  serializeUserFlowConfig,
  type UserFlowConfig,
} from '@/pages/routegen/insights/user-flow'

const VALID_INSIGHT_TYPES = [
  InsightType.TRENDS,
  InsightType.FUNNEL,
  InsightType.RETENTION,
  InsightType.USER_FLOW,
  InsightType.TOP_K,
]
const VALID_GRANULARITIES = [Granularity.HOUR, Granularity.DAY, Granularity.WEEK, Granularity.MONTH]
const VALID_AGGREGATIONS = [
  AggregationType.TOTAL,
  AggregationType.UNIQUE_USERS,
  AggregationType.PER_USER_AVG,
  AggregationType.SUM,
  AggregationType.AVG,
  AggregationType.MIN,
  AggregationType.MAX,
]
const VALID_OPERATORS = new Set([
  FilterOperator.EQUALS,
  FilterOperator.NOT_EQUALS,
  FilterOperator.CONTAINS,
  FilterOperator.NOT_CONTAINS,
  FilterOperator.IN,
  FilterOperator.NOT_IN,
  FilterOperator.IS_SET,
  FilterOperator.IS_NOT_SET,
  FilterOperator.GT,
  FilterOperator.GTE,
  FilterOperator.LT,
  FilterOperator.LTE,
  FilterOperator.BETWEEN,
  FilterOperator.NOT_BETWEEN,
])

const EVENT_FILTERS_PARAM = 'ef'
const PROP_FILTERS_PARAM = 'pf'
const INSIGHT_TYPE_PARAM = 'it'
const GRANULARITY_PARAM = 'gr'
const TIME_FROM_PARAM = 'tf'
const TIME_TO_PARAM = 'tt'
const BREAKDOWNS_PARAM = 'bd'
const USER_FLOW_PARAM = 'uf'
const TOP_K_PARAM = 'tk'

export const BREAKDOWN_MAX = 5
export const BREAKDOWN_RESPONSE_LIMIT = 25

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
const isListOperator = (operator: FilterOperator) =>
  operator === FilterOperator.IN || operator === FilterOperator.NOT_IN
const isRangeOperator = (operator: FilterOperator) =>
  operator === FilterOperator.BETWEEN || operator === FilterOperator.NOT_BETWEEN

const VALID_SOURCES = new Set([PropertySource.AUTO, PropertySource.CUSTOM, PropertySource.PROFILE])

type ParsedBaseFilter = {
  property: string
  source: PropertySource
  operator: FilterOperator
}

const parseBaseFilter = (value: unknown): ParsedBaseFilter | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.property !== 'string' || !v.property || typeof v.operator !== 'number') return null
  if (!VALID_OPERATORS.has(v.operator as FilterOperator)) return null
  const source =
    typeof v.source === 'number' && VALID_SOURCES.has(v.source as PropertySource)
      ? (v.source as PropertySource)
      : PropertySource.UNSPECIFIED
  return { property: v.property, source, operator: v.operator as FilterOperator }
}

const normalizeSingle = (base: ParsedBaseFilter, rawValue: unknown): ActiveFilter | null => {
  if (typeof rawValue !== 'string') return null
  if (isRangeOperator(base.operator)) return null
  if (isListOperator(base.operator)) {
    const next = rawValue.trim()
    return { ...base, kind: 'multi', values: next ? [next] : [] }
  }
  return { ...base, kind: 'single', value: rawValue }
}

const normalizeMulti = (base: ParsedBaseFilter, rawValues: unknown): ActiveFilter | null => {
  if (!isStringArray(rawValues)) return null
  if (isListOperator(base.operator)) return { ...base, kind: 'multi', values: rawValues }
  return null
}

const normalizeRange = (base: ParsedBaseFilter, rawMin: unknown, rawMax: unknown): ActiveFilter | null => {
  if (!isRangeOperator(base.operator)) return null
  if (typeof rawMin !== 'string' || typeof rawMax !== 'string') return null
  if (!rawMin.trim() || !rawMax.trim()) return null
  return { ...base, kind: 'range', min: rawMin, max: rawMax }
}

const parseActiveFilter = (value: unknown): ActiveFilter | null => {
  const base = parseBaseFilter(value)
  if (!base) return null

  const v = value as Record<string, unknown>
  if (v.kind === 'presence') return { ...base, kind: 'presence' }
  if (v.kind === 'single') return normalizeSingle(base, v.value)
  if (v.kind === 'multi') return normalizeMulti(base, v.values)
  if (v.kind === 'range') return normalizeRange(base, v.min, v.max)
  return null
}

const parseEventFilterEntry = (value: unknown): EventFilterEntry | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.kind !== 'string' || !Array.isArray(v.filters)) return null
  const kind = v.kind.trim()
  if (!kind) return null
  const filters = v.filters.map(parseActiveFilter).filter(Boolean) as ActiveFilter[]
  const aggregation =
    typeof v.aggregation === 'number' && VALID_AGGREGATIONS.includes(v.aggregation as AggregationType)
      ? (v.aggregation as AggregationType)
      : undefined
  const aggregationProperty = typeof v.aggregationProperty === 'string' ? v.aggregationProperty.trim() : ''
  return createEntry(kind, {
    filters,
    aggregation,
    ...(aggregationProperty ? { aggregationProperty } : {}),
  })
}

const parseJSONParam = (raw: string | null): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.warn('Failed to parse query param JSON:', raw, err)
    return null
  }
}

const setOrDelete = (url: URL, key: string, value: string | undefined) => {
  if (value === undefined) {
    url.searchParams.delete(key)
    return
  }
  url.searchParams.set(key, value)
}

const replaceUrlIfChanged = (url: URL) => {
  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) {
    window.history.replaceState(window.history.state, '', next)
  }
}

const readTimeGranularityFromParams = (params: URLSearchParams) => {
  const rawGranularityParam = params.get(GRANULARITY_PARAM)
  const rawTimeFromParam = params.get(TIME_FROM_PARAM)
  const rawTimeToParam = params.get(TIME_TO_PARAM)
  const rawGranularity = rawGranularityParam === null ? NaN : Number(rawGranularityParam)
  const rawTimeFrom = rawTimeFromParam === null ? NaN : Number(rawTimeFromParam)
  const rawTimeTo = rawTimeToParam === null ? NaN : Number(rawTimeToParam)

  const granularity = VALID_GRANULARITIES.includes(rawGranularity) ? (rawGranularity as Granularity) : undefined
  const timeRange: TimeRange | undefined =
    Number.isFinite(rawTimeFrom) && Number.isFinite(rawTimeTo) && rawTimeFrom <= rawTimeTo
      ? { from: new Date(rawTimeFrom), to: new Date(rawTimeTo) }
      : undefined

  return { granularity, timeRange }
}

const setTimeGranularityParams = (
  url: URL,
  opts?: {
    granularity?: Granularity
    timeRange?: TimeRange
  },
) => {
  setOrDelete(
    url,
    GRANULARITY_PARAM,
    opts?.granularity !== undefined && opts.granularity !== Granularity.UNSPECIFIED
      ? String(opts.granularity)
      : undefined,
  )

  setOrDelete(url, TIME_FROM_PARAM, opts?.timeRange ? String(opts.timeRange.from.getTime()) : undefined)
  setOrDelete(url, TIME_TO_PARAM, opts?.timeRange ? String(opts.timeRange.to.getTime()) : undefined)
}

export const readTimeGranularityQueryParams = (search = window.location.search) =>
  readTimeGranularityFromParams(new URLSearchParams(search))

export const writeTimeGranularityQueryParams = (opts?: { granularity?: Granularity; timeRange?: TimeRange }) => {
  const url = new URL(window.location.href)
  setTimeGranularityParams(url, opts)
  replaceUrlIfChanged(url)
}

export const readFilterQueryParams = (search = window.location.search) => {
  const params = new URLSearchParams(search)
  const rawEventFilters = parseJSONParam(params.get(EVENT_FILTERS_PARAM))
  const rawPropFilters = parseJSONParam(params.get(PROP_FILTERS_PARAM))
  const rawInsightTypeParam = params.get(INSIGHT_TYPE_PARAM)
  const rawInsightType = rawInsightTypeParam === null ? NaN : Number(rawInsightTypeParam)
  const { granularity, timeRange } = readTimeGranularityFromParams(params)

  const hasEf = params.has(EVENT_FILTERS_PARAM)
  const hasPf = params.has(PROP_FILTERS_PARAM)
  const hasBd = params.has(BREAKDOWNS_PARAM)
  const hasTk = params.has(TOP_K_PARAM)

  const rawBreakdowns = parseJSONParam(params.get(BREAKDOWNS_PARAM))
  const eventFilters = Array.isArray(rawEventFilters)
    ? (rawEventFilters.map(parseEventFilterEntry).filter(Boolean) as EventFilterEntry[])
    : []
  const propFilters = Array.isArray(rawPropFilters)
    ? (rawPropFilters.map(parseActiveFilter).filter(Boolean) as ActiveFilter[])
    : []
  const validBreakdowns = Array.isArray(rawBreakdowns)
    ? rawBreakdowns.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : []
  const breakdowns = Array.from(new Set(validBreakdowns)).slice(0, BREAKDOWN_MAX)

  const droppedEvents = Array.isArray(rawEventFilters) ? rawEventFilters.length - eventFilters.length : 0
  const droppedProps = Array.isArray(rawPropFilters) ? rawPropFilters.length - propFilters.length : 0
  const droppedBreakdowns = Array.isArray(rawBreakdowns) ? rawBreakdowns.length - breakdowns.length : 0

  const warnings: string[] = []
  if (hasEf && params.get(EVENT_FILTERS_PARAM) && eventFilters.length === 0) {
    warnings.push('event filters')
  } else if (droppedEvents > 0) {
    warnings.push(`${droppedEvents} event filter${droppedEvents === 1 ? '' : 's'}`)
  }
  if (hasPf && params.get(PROP_FILTERS_PARAM) && propFilters.length === 0) {
    warnings.push('property filters')
  } else if (droppedProps > 0) {
    warnings.push(`${droppedProps} property filter${droppedProps === 1 ? '' : 's'}`)
  }
  if (hasBd && params.get(BREAKDOWNS_PARAM) && breakdowns.length === 0 && validBreakdowns.length === 0) {
    warnings.push('breakdowns')
  } else if (droppedBreakdowns > 0) {
    const capHit = new Set(validBreakdowns).size > BREAKDOWN_MAX
    const suffix = capHit ? ` (max ${BREAKDOWN_MAX})` : ''
    warnings.push(`${droppedBreakdowns} breakdown${droppedBreakdowns === 1 ? '' : 's'}${suffix}`)
  }
  const rawTopK = parseJSONParam(params.get(TOP_K_PARAM))
  const topK =
    rawTopK && typeof rawTopK === 'object' && !Array.isArray(rawTopK)
      ? normalizeTopKState(rawTopK as Record<string, unknown>)
      : undefined
  // Surface a malformed/unusable `tk` like every other restorable param instead
  // of silently falling back to the default ranking.
  if (hasTk && params.get(TOP_K_PARAM) && !topK) warnings.push('ranking')

  const parseWarning = warnings.length > 0 ? `Could not restore ${warnings.join(' and ')} from URL` : null

  const insightType = VALID_INSIGHT_TYPES.includes(rawInsightType) ? (rawInsightType as InsightType) : undefined
  const rawUserFlow = parseJSONParam(params.get(USER_FLOW_PARAM))
  const userFlowConfig = parseSerializedUserFlowConfig(rawUserFlow) ?? DEFAULT_USER_FLOW_CONFIG

  return {
    eventFilters,
    propFilters,
    insightType,
    granularity,
    timeRange,
    breakdowns,
    userFlowConfig,
    topK,
    parseWarning,
  }
}

export const writeFilterQueryParams = (
  eventFilters: EventFilterEntry[],
  propFilters: ActiveFilter[],
  opts?: {
    insightType?: InsightType
    granularity?: Granularity
    timeRange?: TimeRange
    breakdowns?: string[]
    userFlowConfig?: UserFlowConfig
    topK?: TopKState
  },
) => {
  const url = new URL(window.location.href)

  const setJSONParam = (key: string, value: unknown[]) => {
    setOrDelete(url, key, value.length > 0 ? JSON.stringify(value) : undefined)
  }

  setJSONParam(EVENT_FILTERS_PARAM, eventFilters.map(serializeEntry))
  setJSONParam(PROP_FILTERS_PARAM, propFilters)
  setJSONParam(BREAKDOWNS_PARAM, opts?.breakdowns ?? [])

  setOrDelete(url, INSIGHT_TYPE_PARAM, opts?.insightType !== undefined ? String(opts.insightType) : undefined)
  setOrDelete(
    url,
    USER_FLOW_PARAM,
    opts?.insightType === InsightType.USER_FLOW && opts.userFlowConfig
      ? JSON.stringify(serializeUserFlowConfig(opts.userFlowConfig))
      : undefined,
  )
  setOrDelete(url, TOP_K_PARAM, opts?.topK ? JSON.stringify(opts.topK) : undefined)
  setTimeGranularityParams(url, opts)

  replaceUrlIfChanged(url)
}
