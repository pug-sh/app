import { useState } from 'react'
import type { ActiveFilter } from '@/components/event-filters'

export const toProtoFilters = (filters: ActiveFilter[]) =>
  filters.map(f => ({
    property: f.property,
    operator: f.operator,
    value: f.kind === 'single' ? f.value : '',
    values: f.kind === 'multi' ? f.values : [],
  }))

export const useFilterState = () => {
  const [propFilters, setPropFilters] = useState<ActiveFilter[]>([])
  const addFilter = (f: ActiveFilter) => setPropFilters(prev => [...prev, f])
  const updateFilter = (idx: number, f: ActiveFilter) => setPropFilters(prev => prev.map((x, i) => (i === idx ? f : x)))
  const removeFilter = (idx: number) => setPropFilters(prev => prev.filter((_, i) => i !== idx))
  return { propFilters, setPropFilters, addFilter, updateFilter, removeFilter }
}
