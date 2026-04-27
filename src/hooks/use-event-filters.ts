import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { atom, useAtom } from 'jotai'
import { useCallback, useMemo, useState } from 'react'
import type { ActiveFilter } from '@/components/event-filters'

declare const entryIdBrand: unique symbol
export type EntryId = string & { [entryIdBrand]: true }

export type EventFilterEntry = {
  readonly id: EntryId
  readonly kind: string
  readonly filters: readonly ActiveFilter[]
  readonly aggregation?: AggregationType
}

const newEntryId = () =>
  (crypto.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`) as EntryId

export const createEntry = (
  kind: string,
  opts?: { filters?: readonly ActiveFilter[]; aggregation?: AggregationType }
): EventFilterEntry => ({
  id: newEntryId(),
  kind,
  filters: opts?.filters ?? [],
  ...(opts?.aggregation !== undefined && { aggregation: opts.aggregation }),
})

export const serializeEntry = (e: EventFilterEntry) => ({
  kind: e.kind,
  filters: e.filters,
  ...(e.aggregation !== undefined && { aggregation: e.aggregation }),
})

export const useEventFilters = (defaultEntries: EventFilterEntry[] = []) => {
  const [filtersAtom] = useState(() => atom<EventFilterEntry[]>(defaultEntries))
  const [entries, setEntries] = useAtom(filtersAtom)

  const validEntries = useMemo(() => entries.filter(e => e.kind), [entries])

  const setAggregation = useCallback(
    (id: EntryId, aggregation: AggregationType) => {
      setEntries(prev => prev.map(e => (e.id === id ? { ...e, aggregation } : e)))
    },
    [setEntries]
  )

  const reset = useCallback(
    (nextEntries: EventFilterEntry[] = []) => {
      setEntries(nextEntries)
    },
    [setEntries]
  )

  return { entries, validEntries, filtersAtom, setAggregation, reset } as const
}
