import { useState } from 'react'
import type { ActiveFilter } from '@/components/event-filters'
import type { EventFilterEntry } from '@/hooks/use-event-filters'

export const toProtoFilters = (filters: ActiveFilter[]) =>
  filters.map(f => ({
    property: f.property,
    operator: f.operator,
    value: f.kind === 'single' ? f.value : '',
    values: f.kind === 'multi' ? f.values : [],
  }))

export const toProtoEventFilters = (entries: EventFilterEntry[]) =>
  entries
    .filter(e => e.kind)
    .map(e => ({
      kind: e.kind,
      filters: toProtoFilters(e.filters),
    }))

export const useFilterState = () => {
  const [propFilters, setPropFilters] = useState<ActiveFilter[]>([])
  const addFilter = (f: ActiveFilter) => setPropFilters(prev => [...prev, f])
  const updateFilter = (idx: number, f: ActiveFilter) => setPropFilters(prev => prev.map((x, i) => (i === idx ? f : x)))
  const removeFilter = (idx: number) => setPropFilters(prev => prev.filter((_, i) => i !== idx))
  return { propFilters, addFilter, updateFilter, removeFilter }
}
