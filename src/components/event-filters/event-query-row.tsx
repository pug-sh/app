import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { EventChip } from './pickers'
import type { EntryId, EventFilterEntry } from '@/hooks/use-event-filters'
import type { PrimitiveAtom } from 'jotai'
import { useSetAtom } from 'jotai'
import { memo, useCallback } from 'react'
import { X } from 'lucide-react'
import { useScopedSchema } from './hooks'
import { FilterBuilder } from './filter-builder'
import { FilterChip } from './filter-chip'
import type { ActiveFilter } from '@/lib/filters/filter-model'

export const EventQueryRow = memo(
  ({
    filtersAtom,
    entry,
    events,
    eventsLoaded,
    schema,
    schemaError,
    letter,
    color,
    renderExtra,
    getEventColor,
  }: {
    filtersAtom: PrimitiveAtom<EventFilterEntry[]>
    entry: EventFilterEntry
    events: EventNameMeta[]
    eventsLoaded: boolean
    schema: GetFilterSchemaResponse | null
    schemaError: string | null
    letter?: string
    color?: string
    renderExtra?: (entryId: EntryId) => React.ReactNode
    getEventColor?: (eventName: string) => string
  }) => {
    const setEntries = useSetAtom(filtersAtom)
    const {
      schema: scopedSchema,
      schemaError: scopedSchemaError,
      retry: retryScopedSchema,
    } = useScopedSchema(entry.kind)
    const resolvedSchema = entry.kind ? scopedSchema : schema
    const resolvedSchemaError = entry.kind ? scopedSchemaError : schemaError
    const { id: entryId } = entry

    const onUpdateKind = useCallback(
      (kind: string) => {
        const trimmed = kind.trim()
        if (!trimmed) {
          setEntries(prev => prev.filter(e => e.id !== entryId))
        } else {
          setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, kind: trimmed, filters: [] } : e)))
        }
      },
      [entryId, setEntries]
    )

    const onRemove = useCallback(() => {
      setEntries(prev => prev.filter(e => e.id !== entryId))
    }, [entryId, setEntries])

    const onAddFilter = useCallback(
      (filter: ActiveFilter) => {
        setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, filters: [...e.filters, filter] } : e)))
      },
      [entryId, setEntries]
    )

    const onRemoveFilter = useCallback(
      (filterIdx: number) => {
        setEntries(prev =>
          prev.map(e => (e.id === entryId ? { ...e, filters: e.filters.filter((_, fi) => fi !== filterIdx) } : e))
        )
      },
      [entryId, setEntries]
    )

    const onUpdateFilter = useCallback(
      (filterIdx: number, filter: ActiveFilter) => {
        setEntries(prev =>
          prev.map(e =>
            e.id === entryId ? { ...e, filters: e.filters.map((f, fi) => (fi === filterIdx ? filter : f)) } : e
          )
        )
      },
      [entryId, setEntries]
    )

    return (
      <div className="flex items-center gap-2">
        <div className="inline-flex min-w-0 items-center gap-2 flex-wrap rounded-md border border-border/60 bg-muted/20 px-2 py-1">
          {letter && (
            <span className="flex items-center gap-1.5">
              {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
              <span className="text-[10px] font-semibold text-muted-foreground w-3">{letter}</span>
            </span>
          )}
          <EventChip
            value={entry.kind}
            onChange={onUpdateKind}
            events={events}
            eventsLoaded={eventsLoaded}
            schemaError={resolvedSchemaError}
            color={color}
            getEventColor={getEventColor}
          />
          {entry.kind && (
            <>
              {entry.filters.map((f, fi) => (
                <FilterChip
                  key={fi}
                  filter={f}
                  kindFilter={entry.kind}
                  onRemove={() => onRemoveFilter(fi)}
                  onUpdate={next => onUpdateFilter(fi, next)}
                />
              ))}
              <FilterBuilder
                schema={resolvedSchema}
                schemaError={resolvedSchemaError}
                onAdd={onAddFilter}
                kindFilter={entry.kind}
              />
              {scopedSchemaError && (
                <button
                  type="button"
                  onClick={retryScopedSchema}
                  title={scopedSchemaError}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  retry schema
                </button>
              )}
              {renderExtra?.(entry.id)}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="self-center p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }
)
