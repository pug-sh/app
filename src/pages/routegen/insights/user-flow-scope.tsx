import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterBuilder, FilterChip } from '@/components/event-filters'
import { useScopedSchema } from '@/components/event-filters/hooks'
import { EventChip } from '@/components/event-filters/pickers'
import { getSeriesColor } from '@/lib/event-colors'
import type { UserFlowScope } from './user-flow'

export const UserFlowScopeControls = ({
  scope,
  onChange,
  events,
  schemaError,
}: {
  scope: UserFlowScope
  onChange: (next: UserFlowScope) => void
  events: EventNameMeta[] | undefined
  schemaError: string | null
}) => {
  const eventsLoaded = events !== undefined
  const { schema: scopedSchema, schemaError: scopedSchemaError } = useScopedSchema(scope.kind)

  const addFilter = (filter: UserFlowScope['filters'][number]) => {
    onChange({ ...scope, filters: [...scope.filters, filter] })
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <EventChip
          value={scope.kind}
          onChange={kind => {
            const trimmed = kind.trim()
            onChange({
              kind: trimmed,
              filters: trimmed ? scope.filters : [],
            })
          }}
          events={events ?? []}
          eventsLoaded={eventsLoaded}
          schemaError={schemaError}
          getEventColor={eventName => getSeriesColor(eventName).dot}
        />
        {scope.kind
          ? scope.filters.map((filter, index) => (
              <FilterChip
                key={`scope-filter-${index}`}
                filter={filter}
                onRemove={() => onChange({ ...scope, filters: scope.filters.filter((_, i) => i !== index) })}
                onUpdate={next =>
                  onChange({
                    ...scope,
                    filters: scope.filters.map((current, i) => (i === index ? next : current)),
                  })
                }
              />
            ))
          : null}
        {scope.kind ? <FilterBuilder schema={scopedSchema} schemaError={scopedSchemaError} onAdd={addFilter} /> : null}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Scope limits which events can become nodes. Leave empty to include all events.
      </p>
    </div>
  )
}
