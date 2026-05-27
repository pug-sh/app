import { useState } from 'react'
import type { ActiveFilter } from '@/components/event-filters/filter-model'

export type FilterStateController = {
  readonly propFilters: ActiveFilter[]
  readonly addFilter: (f: ActiveFilter) => void
  readonly updateFilter: (idx: number, f: ActiveFilter) => void
  readonly removeFilter: (idx: number) => void
}

export const useFilterState = (initialPropFilters: ActiveFilter[] = []): FilterStateController => {
  const [propFilters, setPropFilters] = useState<ActiveFilter[]>(initialPropFilters)
  const addFilter = (f: ActiveFilter) => setPropFilters(prev => [...prev, f])
  const updateFilter = (idx: number, f: ActiveFilter) => setPropFilters(prev => prev.map((x, i) => (i === idx ? f : x)))
  const removeFilter = (idx: number) => setPropFilters(prev => prev.filter((_, i) => i !== idx))
  return { propFilters, addFilter, updateFilter, removeFilter }
}
