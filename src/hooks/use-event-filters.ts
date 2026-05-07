import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { atom, useAtom } from 'jotai'
import { useCallback, useMemo, useState } from 'react'
import type { ActiveFilter } from '@/components/event-filters/filter-model'

declare const entryIdBrand: unique symbol
export type EntryId = string & { [entryIdBrand]: true }

export type EventFilterEntry = {
  readonly id: EntryId
  readonly kind: string
  readonly filters: readonly ActiveFilter[]
  readonly aggregation?: AggregationType
  readonly aggregationProperty?: string
}

const requiresAggregationProperty = (aggregation: AggregationType) =>
  aggregation === AggregationType.SUM ||
  aggregation === AggregationType.AVG ||
  aggregation === AggregationType.MIN ||
  aggregation === AggregationType.MAX

const newEntryId = () =>
  (crypto.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`) as EntryId

export const createEntry = (
  kind: string,
  opts?: { filters?: readonly ActiveFilter[]; aggregation?: AggregationType; aggregationProperty?: string }
): EventFilterEntry => ({
  id: newEntryId(),
  kind,
  filters: opts?.filters ?? [],
  ...(opts?.aggregation !== undefined && { aggregation: opts.aggregation }),
  ...(opts?.aggregationProperty !== undefined && { aggregationProperty: opts.aggregationProperty }),
})

export const serializeEntry = (e: EventFilterEntry) => ({
  kind: e.kind,
  filters: e.filters,
  ...(e.aggregation !== undefined && { aggregation: e.aggregation }),
  ...(e.aggregationProperty !== undefined && { aggregationProperty: e.aggregationProperty }),
})

export const useEventFilters = (defaultEntries: EventFilterEntry[] = []) => {
  const [filtersAtom] = useState(() => atom<EventFilterEntry[]>(defaultEntries))
  const [entries, setEntries] = useAtom(filtersAtom)

  const validEntries = useMemo(() => entries.filter(e => e.kind), [entries])

  const setAggregation = useCallback(
    (id: EntryId, aggregation: AggregationType) => {
      setEntries(prev =>
        prev.map(e => {
          if (e.id !== id) return e

          if (!requiresAggregationProperty(aggregation)) {
            return { ...e, aggregation, aggregationProperty: '' }
          }

          return { ...e, aggregation }
        })
      )
    },
    [setEntries]
  )

  const setAggregationProperty = useCallback(
    (id: EntryId, aggregationProperty: string) => {
      setEntries(prev => prev.map(e => (e.id === id ? { ...e, aggregationProperty } : e)))
    },
    [setEntries]
  )

  const reset = useCallback(
    (nextEntries: EventFilterEntry[] = []) => {
      setEntries(nextEntries)
    },
    [setEntries]
  )

  return { entries, validEntries, filtersAtom, setAggregation, setAggregationProperty, reset } as const
}
