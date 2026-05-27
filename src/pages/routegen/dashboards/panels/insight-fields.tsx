import { CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { BreakdownBuilder, BreakdownChip, EventFilterBar, FilterBuilder, FilterChip } from '@/components/event-filters'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type EventFilterEntry, useEventFilters } from '@/hooks/use-event-filters'
import type { useFilterState } from '@/hooks/use-filter-state'
import { getSeriesColor } from '@/lib/event-colors'

export type InsightFieldsProps = {
  insightType: InsightType
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  globalSchema: GetFilterSchemaResponse | null
  globalSchemaError: string | null
  eventFilters: ReturnType<typeof useEventFilters>
  filterState: ReturnType<typeof useFilterState>
  breakdowns: string[]
  addBreakdown: (property: string) => void
  removeBreakdown: (property: string) => void
  renderRowExtra?: (
    entry: EventFilterEntry,
    rowSchema: GetFilterSchemaResponse | null,
    rowSchemaError: string | null,
  ) => ReactNode
}

export const InsightFields = ({
  insightType,
  schema,
  schemaError,
  globalSchema,
  globalSchemaError,
  eventFilters,
  filterState,
  breakdowns,
  addBreakdown,
  removeBreakdown,
  renderRowExtra,
}: InsightFieldsProps) => {
  const isRetention = insightType === InsightType.RETENTION
  const { propFilters, addFilter, updateFilter, removeFilter } = filterState

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <EventFilterBar
          filtersAtom={eventFilters.filtersAtom}
          events={schema?.events}
          schema={schema}
          schemaError={schemaError}
          showLetters
          seriesColors={eventFilters.entries.map((entry, index) =>
            getSeriesColor(entry.kind || `step ${index + 1}`, index),
          )}
          getEventColor={eventName => getSeriesColor(eventName).dot}
          renderRowExtra={renderRowExtra}
          maxEvents={isRetention ? 2 : undefined}
        />
        {isRetention ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Tooltip>
              <TooltipTrigger className="inline-flex cursor-help items-center">
                <CircleHelp className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-xs text-xs">
                Use up to two events: A defines the cohort entry event, B defines the return event.
              </TooltipContent>
            </Tooltip>
            <span>Retention supports up to 2 events.</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {propFilters.map((filter, index) => (
          <FilterChip
            key={`filter-${index}`}
            filter={filter}
            onRemove={() => removeFilter(index)}
            onUpdate={next => updateFilter(index, next)}
          />
        ))}
        <FilterBuilder schema={globalSchema} schemaError={globalSchemaError} onAdd={addFilter} />
        {propFilters.length > 0 || breakdowns.length > 0 ? <span className="mx-0.5 h-4 w-px bg-border" /> : null}
        {breakdowns.map(property => (
          <BreakdownChip key={property} property={property} onRemove={() => removeBreakdown(property)} />
        ))}
        <BreakdownBuilder
          schema={globalSchema}
          schemaError={globalSchemaError}
          breakdowns={breakdowns}
          onAdd={addBreakdown}
          onRemove={removeBreakdown}
          disabled={breakdowns.length >= 5 ? { reason: 'Up to 5 breakdowns' } : undefined}
        />
      </div>
    </div>
  )
}
