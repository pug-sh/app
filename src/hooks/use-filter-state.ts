import { useState } from 'react'
import type { ActiveFilter } from '@/components/event-filters'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'

export const toProtoFilters = (filters: readonly ActiveFilter[]) =>
  filters.map(f => {
    switch (f.kind) {
      case 'multi': {
        const isBetween = f.operator === FilterOperator.BETWEEN || f.operator === FilterOperator.NOT_BETWEEN
        return { property: f.property, operator: f.operator, value: isBetween ? f.values[0] ?? '' : '', values: f.values }
      }
      case 'presence':
        return { property: f.property, operator: f.operator, value: '', values: [] }
      case 'single':
        return { property: f.property, operator: f.operator, value: f.value, values: [] }
    }
  })

export const toProtoEventFilters = (entries: EventFilterEntry[]) =>
  entries
    .filter(e => e.kind)
    .map(e => ({
      kind: e.kind,
      filters: toProtoFilters(e.filters),
    }))

export const useFilterState = (initialPropFilters: ActiveFilter[] = []) => {
  const [propFilters, setPropFilters] = useState<ActiveFilter[]>(initialPropFilters)
  const addFilter = (f: ActiveFilter) => setPropFilters(prev => [...prev, f])
  const updateFilter = (idx: number, f: ActiveFilter) => setPropFilters(prev => prev.map((x, i) => (i === idx ? f : x)))
  const removeFilter = (idx: number) => setPropFilters(prev => prev.filter((_, i) => i !== idx))
  return { propFilters, addFilter, updateFilter, removeFilter }
}
