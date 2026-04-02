import { useState } from 'react'
import type { ActiveFilter } from '@/components/event-filters'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'

export const toProtoFilters = (filters: ActiveFilter[]) =>
  filters.map(f => {
    const isInOperator = f.operator === FilterOperator.IN || f.operator === FilterOperator.NOT_IN
    if (isInOperator) {
      const values: string[] = []
      if (f.kind === 'multi') {
        values.push(...f.values)
      } else if (f.kind === 'single') {
        const next = f.value.trim()
        if (next) values.push(next)
      }
      return {
        property: f.property,
        operator: f.operator,
        value: '',
        values,
      }
    }

    let value = ''
    if (f.kind === 'single') {
      value = f.value
    } else if (f.kind === 'multi') {
      value = f.values[0] ?? ''
    }
    return {
      property: f.property,
      operator: f.operator,
      value,
      values: [],
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
