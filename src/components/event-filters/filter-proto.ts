import type { EventFilterEntry } from '@/hooks/use-event-filters'
import type { ActiveFilter } from './filter-model'

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
