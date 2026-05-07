import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { EventChip } from './pickers'
import { createEntry } from '@/hooks/use-event-filters'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import type { PrimitiveAtom } from 'jotai'
import { useAtom } from 'jotai'
import { useCallback } from 'react'
import { EventQueryRow } from './event-query-row'

const EMPTY_EVENTS: EventNameMeta[] = []
const SERIES_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const EventFilterBar = ({
  filtersAtom,
  events,
  schema,
  schemaError,
  showLetters,
  seriesColors,
  renderRowExtra,
  maxEvents,
  getEventColor,
}: {
  filtersAtom: PrimitiveAtom<EventFilterEntry[]>
  events?: EventNameMeta[]
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  showLetters?: boolean
  seriesColors?: { dot: string }[]
  renderRowExtra?: (
    entry: EventFilterEntry,
    schema: GetFilterSchemaResponse | null,
    schemaError: string | null
  ) => React.ReactNode
  maxEvents?: number
  getEventColor?: (eventName: string) => string
}) => {
  const [entries, setEntries] = useAtom(filtersAtom)
  const safeEvents = events ?? EMPTY_EVENTS
  const eventsLoaded = events !== undefined

  const addEvent = useCallback(
    (kind: string) => {
      const trimmed = kind.trim()
      if (!trimmed) return
      setEntries(prev => [...prev, createEntry(trimmed)])
    },
    [setEntries]
  )

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry, i) => (
        <EventQueryRow
          key={entry.id}
          filtersAtom={filtersAtom}
          entry={entry}
          events={safeEvents}
          eventsLoaded={eventsLoaded}
          schema={schema}
          schemaError={schemaError}
          letter={showLetters ? SERIES_LETTERS[i] : undefined}
          color={showLetters && seriesColors ? seriesColors[i % seriesColors.length]?.dot : undefined}
          renderExtra={renderRowExtra}
          getEventColor={getEventColor}
        />
      ))}
      {(maxEvents === undefined || entries.length < maxEvents) && (
        <div className="flex items-center gap-2">
          {showLetters && entries.length > 0 && <span className="w-7" />}
          <EventChip
            value=""
            onChange={kind => {
              if (kind) addEvent(kind)
            }}
            events={safeEvents}
            eventsLoaded={eventsLoaded}
            schemaError={schemaError}
            getEventColor={getEventColor}
          />
        </div>
      )}
    </div>
  )
}
