import type { ActiveFilter } from '@/components/event-filters'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'

const EVENT_FILTERS_PARAM = 'ef'
const PROP_FILTERS_PARAM = 'pf'

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

const parseActiveFilter = (value: unknown): ActiveFilter | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.property !== 'string' || typeof v.operator !== 'number' || typeof v.kind !== 'string') return null
  if (v.kind === 'presence') return { property: v.property, operator: v.operator, kind: 'presence' }
  const isInOperator = v.operator === FilterOperator.IN || v.operator === FilterOperator.NOT_IN
  if (v.kind === 'single' && typeof v.value === 'string') {
    if (isInOperator) {
      const next = v.value.trim()
      return { property: v.property, operator: v.operator, kind: 'multi', values: next ? [next] : [] }
    }
    return { property: v.property, operator: v.operator, kind: 'single', value: v.value }
  }
  if (v.kind === 'multi' && isStringArray(v.values)) {
    if (isInOperator) {
      return { property: v.property, operator: v.operator, kind: 'multi', values: v.values }
    }
    return { property: v.property, operator: v.operator, kind: 'single', value: v.values[0] ?? '' }
  }
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

  const eventFilters = Array.isArray(rawEventFilters)
    ? rawEventFilters.map(parseEventFilterEntry).filter(Boolean) as EventFilterEntry[]
    : []
  const propFilters = Array.isArray(rawPropFilters)
    ? rawPropFilters.map(parseActiveFilter).filter(Boolean) as ActiveFilter[]
    : []

  return { eventFilters, propFilters }
}

export const writeFilterQueryParams = (eventFilters: EventFilterEntry[], propFilters: ActiveFilter[]) => {
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

  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) {
    window.history.replaceState(window.history.state, '', next)
  }
}
