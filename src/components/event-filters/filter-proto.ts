import type { PropertyFilter } from '@/api/genproto/common/v1/filters_pb'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { type ActiveFilter, FILTER_OPERATORS } from './filter-model'

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

export const toProtoFilters = (filters: readonly ActiveFilter[]) =>
  filters.map(f => {
    switch (f.kind) {
      case 'multi':
        return { property: f.property, source: f.source, operator: f.operator, value: '', values: f.values }
      case 'range':
        return { property: f.property, source: f.source, operator: f.operator, value: '', values: [f.min, f.max] }
      case 'presence':
        return { property: f.property, source: f.source, operator: f.operator, value: '', values: [] }
      case 'single':
        return { property: f.property, source: f.source, operator: f.operator, value: f.value, values: [] }
    }
  })

export const toProtoEventFilters = (entries: EventFilterEntry[]) =>
  entries
    .filter(e => e.kind)
    .map(e => ({
      kind: e.kind,
      filters: toProtoFilters(e.filters),
    }))
