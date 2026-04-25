import type { ActiveFilter } from '@/components/event-filters'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { AggregationType, Granularity, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'

const VALID_INSIGHT_TYPES = [InsightType.TRENDS, InsightType.FUNNEL, InsightType.RETENTION]
const VALID_GRANULARITIES = [Granularity.HOUR, Granularity.DAY, Granularity.WEEK, Granularity.MONTH]
const VALID_AGGREGATIONS = [AggregationType.TOTAL, AggregationType.UNIQUE_USERS, AggregationType.PER_USER_AVG]
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
])

const EVENT_FILTERS_PARAM = 'ef'
const PROP_FILTERS_PARAM = 'pf'
const INSIGHT_TYPE_PARAM = 'it'
const GRANULARITY_PARAM = 'gr'
const TIME_FROM_PARAM = 'tf'
const TIME_TO_PARAM = 'tt'

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
const isInOperator = (operator: FilterOperator) => operator === FilterOperator.IN || operator === FilterOperator.NOT_IN

type ParsedBaseFilter = {
  property: string
  operator: FilterOperator
}

const parseBaseFilter = (value: unknown): ParsedBaseFilter | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.property !== 'string' || !v.property || typeof v.operator !== 'number') return null
  if (!VALID_OPERATORS.has(v.operator as FilterOperator)) return null
  return { property: v.property, operator: v.operator as FilterOperator }
}

const normalizeSingle = (base: ParsedBaseFilter, rawValue: unknown): ActiveFilter | null => {
  if (typeof rawValue !== 'string') return null
  if (isInOperator(base.operator)) {
    const next = rawValue.trim()
    return { ...base, kind: 'multi', values: next ? [next] : [] }
  }
  return { ...base, kind: 'single', value: rawValue }
}

const normalizeMulti = (base: ParsedBaseFilter, rawValues: unknown): ActiveFilter | null => {
  if (!isStringArray(rawValues)) return null
  if (isInOperator(base.operator)) {
    return { ...base, kind: 'multi', values: rawValues }
  }
  return { ...base, kind: 'single', value: rawValues[0] ?? '' }
}

const parseActiveFilter = (value: unknown): ActiveFilter | null => {
  const base = parseBaseFilter(value)
  if (!base) return null

  const kind = (value as Record<string, unknown>).kind
  if (kind === 'presence') return { ...base, kind: 'presence' }
  if (kind === 'single') return normalizeSingle(base, (value as Record<string, unknown>).value)
  if (kind === 'multi') return normalizeMulti(base, (value as Record<string, unknown>).values)
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
  return { kind, filters, ...(aggregation !== undefined && { aggregation }) }
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

export const readFilterQueryParams = (search = window.location.search) => {
  const params = new URLSearchParams(search)
  const rawEventFilters = parseJSONParam(params.get(EVENT_FILTERS_PARAM))
  const rawPropFilters = parseJSONParam(params.get(PROP_FILTERS_PARAM))
  const rawInsightTypeParam = params.get(INSIGHT_TYPE_PARAM)
  const rawGranularityParam = params.get(GRANULARITY_PARAM)
  const rawTimeFromParam = params.get(TIME_FROM_PARAM)
  const rawTimeToParam = params.get(TIME_TO_PARAM)
  const rawInsightType = rawInsightTypeParam === null ? NaN : Number(rawInsightTypeParam)
  const rawGranularity = rawGranularityParam === null ? NaN : Number(rawGranularityParam)
  const rawTimeFrom = rawTimeFromParam === null ? NaN : Number(rawTimeFromParam)
  const rawTimeTo = rawTimeToParam === null ? NaN : Number(rawTimeToParam)

  const hasEf = params.has(EVENT_FILTERS_PARAM)
  const hasPf = params.has(PROP_FILTERS_PARAM)

  const eventFilters = Array.isArray(rawEventFilters)
    ? (rawEventFilters.map(parseEventFilterEntry).filter(Boolean) as EventFilterEntry[])
    : []
  const propFilters = Array.isArray(rawPropFilters)
    ? (rawPropFilters.map(parseActiveFilter).filter(Boolean) as ActiveFilter[])
    : []

  const warnings: string[] = []
  if (hasEf && params.get(EVENT_FILTERS_PARAM) && eventFilters.length === 0) warnings.push('event filters')
  if (hasPf && params.get(PROP_FILTERS_PARAM) && propFilters.length === 0) warnings.push('property filters')
  const parseWarning = warnings.length > 0 ? `Could not restore ${warnings.join(' and ')} from URL` : null

  const insightType = VALID_INSIGHT_TYPES.includes(rawInsightType) ? (rawInsightType as InsightType) : undefined
  const granularity = VALID_GRANULARITIES.includes(rawGranularity) ? (rawGranularity as Granularity) : undefined
  const timeRange: TimeRange | undefined =
    Number.isFinite(rawTimeFrom) && Number.isFinite(rawTimeTo) && rawTimeFrom <= rawTimeTo
      ? { from: new Date(rawTimeFrom), to: new Date(rawTimeTo) }
      : undefined

  return { eventFilters, propFilters, insightType, granularity, timeRange, parseWarning }
}

export const writeFilterQueryParams = (
  eventFilters: EventFilterEntry[],
  propFilters: ActiveFilter[],
  opts?: {
    insightType?: InsightType
    granularity?: Granularity
    timeRange?: TimeRange
  }
) => {
  const url = new URL(window.location.href)

  const setOrDelete = (key: string, value: string | undefined) => {
    if (value === undefined) {
      url.searchParams.delete(key)
      return
    }
    url.searchParams.set(key, value)
  }

  const setJSONParam = (key: string, value: unknown[]) => {
    setOrDelete(key, value.length > 0 ? JSON.stringify(value) : undefined)
  }

  setJSONParam(EVENT_FILTERS_PARAM, eventFilters)
  setJSONParam(PROP_FILTERS_PARAM, propFilters)

  setOrDelete(INSIGHT_TYPE_PARAM, opts?.insightType !== undefined ? String(opts.insightType) : undefined)
  setOrDelete(GRANULARITY_PARAM, opts?.granularity !== undefined ? String(opts.granularity) : undefined)

  const timeFrom = opts?.timeRange ? String(opts.timeRange.from.getTime()) : undefined
  const timeTo = opts?.timeRange ? String(opts.timeRange.to.getTime()) : undefined
  setOrDelete(TIME_FROM_PARAM, timeFrom)
  setOrDelete(TIME_TO_PARAM, timeTo)

  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) {
    window.history.replaceState(window.history.state, '', next)
  }
}
