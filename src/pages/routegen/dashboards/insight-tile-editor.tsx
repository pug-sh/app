import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { Check, CircleHelp, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  type Granularity,
  InsightType,
  type QueryRequest,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { BreakdownBuilder, BreakdownChip, EventFilterBar, FilterBuilder, FilterChip } from '@/components/event-filters'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type EventFilterEntry, useEventFilters } from '@/hooks/use-event-filters'
import { useFilterState } from '@/hooks/use-filter-state'
import { useGlobalFilterSchema } from '@/hooks/use-global-filter-schema'
import { getSeriesColor } from '@/lib/event-colors'
import { toastRPCError } from '@/lib/rpc-error'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../events/filter-schema.atoms'
import { INSIGHT_TYPES, NUMERIC_AGGREGATIONS } from '../insights/constants'
import { InsightsRowAggregationControls, OptionChip } from '../insights/controls'
import { InlineEditableText } from './editor-shared'
import { DashboardInsightPreview } from './insight-tile-content'
import { buildInsightQuery, getInsightEditorDefaults } from './query'

const tileSchema = z.object({
  displayName: z.string().trim().optional(),
  description: z.string().trim().optional(),
})

export const InsightTileEditor = ({
  tile,
  dashboardTimeRange,
  dashboardGranularity,
  saving,
  onCancel,
  onSubmit,
}: {
  tile?: DashboardTile
  dashboardTimeRange?: TimeRange
  dashboardGranularity: Granularity
  saving: boolean
  onCancel: () => void
  onSubmit: (input: { displayName: string; description: string; query: QueryRequest }) => Promise<void>
}) => {
  const defaults = useMemo(() => getInsightEditorDefaults(tile), [tile])
  const [displayName, setDisplayName] = useState(defaults.displayName)
  const [description, setDescription] = useState(defaults.description)
  const [insightType, setInsightType] = useState(defaults.insightType)
  const eventFilters = useEventFilters(defaults.eventEntries)
  const { propFilters, addFilter, updateFilter, removeFilter } = useFilterState(defaults.propFilters)
  const [breakdowns, setBreakdowns] = useState(defaults.breakdowns)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)
  const store = useStore()
  const { schema: globalSchema, schemaError: globalSchemaError } = useGlobalFilterSchema({
    baseSchema: schema,
    baseSchemaError: schemaError,
    selectedEventKinds: eventFilters.entries.map(entry => entry.kind),
  })

  useEffect(() => {
    fetchSchema()
  }, [fetchSchema])

  const validEntries = eventFilters.validEntries
  const isTrends = insightType === InsightType.TRENDS
  const isRetention = insightType === InsightType.RETENTION
  const queryTimeRange = dashboardTimeRange ?? defaults.timeRange
  const queryGranularity = dashboardGranularity

  useEffect(() => {
    if (insightType !== InsightType.RETENTION) return
    const entries = store.get(eventFilters.filtersAtom)
    if (entries.length <= 2) return
    eventFilters.reset(entries.slice(0, 2))
  }, [eventFilters, insightType, store])

  const hasIncompleteNumericAggregation = useMemo(
    () =>
      insightType === InsightType.TRENDS &&
      validEntries.some(
        entry =>
          NUMERIC_AGGREGATIONS.has(entry.aggregation ?? AggregationType.TOTAL) &&
          !(entry.aggregationProperty ?? '').trim(),
      ),
    [insightType, validEntries],
  )

  const previewQuery = useMemo(() => {
    if (validEntries.length === 0 || hasIncompleteNumericAggregation) return undefined
    return buildInsightQuery({
      insightType,
      granularity: queryGranularity,
      timeRange: queryTimeRange,
      validEntries,
      propFilters,
      breakdowns,
    })
  }, [
    breakdowns,
    hasIncompleteNumericAggregation,
    insightType,
    propFilters,
    queryGranularity,
    queryTimeRange,
    validEntries,
  ])

  const renderRowExtra = useMemo(() => {
    if (!isTrends) return undefined

    return (entry: EventFilterEntry, rowSchema: GetFilterSchemaResponse | null, rowSchemaError: string | null) => (
      <InsightsRowAggregationControls
        entry={entry}
        rowSchema={rowSchema}
        rowSchemaError={rowSchemaError}
        filtersAtom={eventFilters.filtersAtom}
        setAggregation={eventFilters.setAggregation}
        setAggregationProperty={eventFilters.setAggregationProperty}
      />
    )
  }, [eventFilters.filtersAtom, eventFilters.setAggregation, eventFilters.setAggregationProperty, isTrends])

  const addBreakdown = (property: string) => {
    setBreakdowns(current => {
      if (current.includes(property) || current.length >= 5) return current
      return [...current, property]
    })
  }

  const removeBreakdown = (property: string) => {
    setBreakdowns(current => current.filter(item => item !== property))
  }

  const handleSubmit = async () => {
    const parsed = tileSchema.safeParse({ displayName, description })
    if (!parsed.success) {
      toastRPCError(new Error(parsed.error.issues[0]?.message ?? 'Invalid tile'), 'Invalid tile')
      return
    }

    if (validEntries.length === 0) {
      toastRPCError(new Error('Pick at least one event'), 'Invalid tile')
      return
    }

    if (hasIncompleteNumericAggregation) {
      toastRPCError(new Error('Select a numeric property for the chosen aggregation'), 'Invalid tile')
      return
    }

    await onSubmit({
      displayName: parsed.data.displayName || 'Untitled chart',
      description: parsed.data.description ?? '',
      query: buildInsightQuery({
        insightType,
        granularity: queryGranularity,
        timeRange: queryTimeRange,
        validEntries,
        propFilters,
        breakdowns,
      }),
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <InlineEditableText
            value={displayName}
            onChange={setDisplayName}
            placeholder="Untitled chart"
            disabled={saving}
            className="min-h-8 text-lg font-semibold outline-hidden"
          />
          <InlineEditableText
            value={description}
            onChange={setDescription}
            placeholder="Add a description"
            disabled={saving}
            multiline
            className="min-h-5 text-sm text-muted-foreground outline-hidden"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            onClick={handleSubmit}
            disabled={saving}
            aria-label={tile ? 'Save chart tile' : 'Add chart tile'}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onCancel} disabled={saving} aria-label="Close tile editor">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <OptionChip label="insight" options={INSIGHT_TYPES} value={insightType} onChange={setInsightType} />
      </div>

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
              <TooltipTrigger className="inline-flex items-center cursor-help">
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

      {previewQuery ? (
        <DashboardInsightPreview query={previewQuery} timeRange={dashboardTimeRange} granularity={queryGranularity} />
      ) : null}
    </div>
  )
}
