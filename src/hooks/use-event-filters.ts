import { useState } from 'react'
import type { ActiveFilter } from '@/components/event-filters'

export type EventFilterEntry = {
  kind: string
  filters: ActiveFilter[]
}

export const useEventFilters = (initialEntries: EventFilterEntry[] = []) => {
  const [entries, setEntries] = useState<EventFilterEntry[]>(initialEntries)

  const addEvent = (kind: string) => {
    setEntries(prev => [...prev, { kind, filters: [] }])
  }

  const removeEvent = (idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }

  const updateEventKind = (idx: number, kind: string) => {
    if (!kind) {
      removeEvent(idx)
      return
    }
    setEntries(prev => prev.map((e, i) => (i === idx ? { ...e, kind } : e)))
  }

  const addEventFilter = (eventIdx: number, filter: ActiveFilter) => {
    setEntries(prev =>
      prev.map((e, i) => (i === eventIdx ? { ...e, filters: [...e.filters, filter] } : e))
    )
  }

  const removeEventFilter = (eventIdx: number, filterIdx: number) => {
    setEntries(prev =>
      prev.map((e, i) => (i === eventIdx ? { ...e, filters: e.filters.filter((_, fi) => fi !== filterIdx) } : e))
    )
  }

  const updateEventFilter = (eventIdx: number, filterIdx: number, filter: ActiveFilter) => {
    setEntries(prev =>
      prev.map((e, i) =>
        i === eventIdx ? { ...e, filters: e.filters.map((f, fi) => (fi === filterIdx ? filter : f)) } : e
      )
    )
  }

  return { entries, addEvent, removeEvent, updateEventKind, addEventFilter, removeEventFilter, updateEventFilter } as const
}

export type EventFiltersHandle = ReturnType<typeof useEventFilters>
