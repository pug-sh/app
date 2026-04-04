import type { ActiveFilter } from '@/components/event-filters'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { Granularity, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'

const EVENT_FILTERS_PARAM = 'ef'
const PROP_FILTERS_PARAM = 'pf'
const INSIGHT_TYPE_PARAM = 'it'
const GRANULARITY_PARAM = 'gr'
const TIME_FROM_PARAM = 'tf'
const TIME_TO_PARAM = 'tt'

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
const isInOperator = (operator: FilterOperator) =>
  operator === FilterOperator.IN || operator === FilterOperator.NOT_IN

type ParsedBaseFilter = {
  property: string
  operator: FilterOperator
}

const parseBaseFilter = (value: unknown): ParsedBaseFilter | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.property !== 'string' || typeof v.operator !== 'number') return null
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
  const filters = v.filters.map(parseActiveFilter).filter(Boolean) as ActiveFilter[]
  return { kind: v.kind, filters }
}

const parseJSONParam = (raw: string | null): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const readFilterQueryParams = (search: string) => {
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

  const eventFilters = Array.isArray(rawEventFilters)
    ? rawEventFilters.map(parseEventFilterEntry).filter(Boolean) as EventFilterEntry[]
    : []
  const propFilters = Array.isArray(rawPropFilters)
    ? rawPropFilters.map(parseActiveFilter).filter(Boolean) as ActiveFilter[]
    : []

  const insightType = Number.isFinite(rawInsightType) ? rawInsightType as InsightType : undefined
  const granularity = Number.isFinite(rawGranularity) ? rawGranularity as Granularity : undefined
  const timeRange: TimeRange | undefined =
    Number.isFinite(rawTimeFrom) && Number.isFinite(rawTimeTo)
      ? { from: new Date(rawTimeFrom), to: new Date(rawTimeTo) }
      : undefined

  return { eventFilters, propFilters, insightType, granularity, timeRange }
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
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (eventFilters.length > 0) {
    url.searchParams.set(EVENT_FILTERS_PARAM, JSON.stringify(eventFilters))
  } else {
    url.searchParams.delete(EVENT_FILTERS_PARAM)
  }
  if (propFilters.length > 0) {
    url.searchParams.set(PROP_FILTERS_PARAM, JSON.stringify(propFilters))
  } else {
    url.searchParams.delete(PROP_FILTERS_PARAM)
  }
  if (opts?.insightType !== undefined) {
    url.searchParams.set(INSIGHT_TYPE_PARAM, String(opts.insightType))
  } else {
    url.searchParams.delete(INSIGHT_TYPE_PARAM)
  }
  if (opts?.granularity !== undefined) {
    url.searchParams.set(GRANULARITY_PARAM, String(opts.granularity))
  } else {
    url.searchParams.delete(GRANULARITY_PARAM)
  }
  if (opts?.timeRange) {
    url.searchParams.set(TIME_FROM_PARAM, String(opts.timeRange.from.getTime()))
    url.searchParams.set(TIME_TO_PARAM, String(opts.timeRange.to.getTime()))
  } else {
    url.searchParams.delete(TIME_FROM_PARAM)
    url.searchParams.delete(TIME_TO_PARAM)
  }

  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) {
    window.history.replaceState(window.history.state, '', next)
  }
}
