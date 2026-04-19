import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { atom, useAtom } from 'jotai'
import { useCallback, useMemo, useState } from 'react'
import type { ActiveFilter } from '@/components/event-filters'

export type EventFilterEntry = {
  kind: string
  filters: ActiveFilter[]
  aggregation?: AggregationType
}

export const useEventFilters = (initialEntries: EventFilterEntry[] = []) => {
  const [filtersAtom] = useState(() => atom<EventFilterEntry[]>(initialEntries))
  const [entries, setEntries] = useAtom(filtersAtom)

  const validEntries = useMemo(() => entries.filter(e => e.kind), [entries])

  const setAggregation = useCallback((idx: number, aggregation: AggregationType) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, aggregation } : e))
  }, [setEntries])

  const reset = useCallback((nextEntries: EventFilterEntry[] = []) => {
    setEntries(nextEntries)
  }, [setEntries])

  return { entries, validEntries, filtersAtom, setAggregation, reset } as const
}
