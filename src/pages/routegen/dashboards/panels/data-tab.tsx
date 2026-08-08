import { create } from '@bufbuild/protobuf'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { useEffect, useMemo, useState } from 'react'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import {
  ComparePeriod,
  type DashboardTile,
  DashboardTileViewMode,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { type EventFilterEntry, useEventFilters } from '@/hooks/use-event-filters'
import { useFilterState } from '@/hooks/use-filter-state'
import { useGlobalFilterSchema } from '@/hooks/use-global-filter-schema'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../../events/filter-schema.atoms'
import { eventEntryCap, INSIGHT_TYPES, isIncompleteNumericAggregation } from '../../insights/constants'
import { InsightsRowAggregationControls, OptionChip } from '../../insights/controls'
import { UserFlowControls } from '../../insights/user-flow-controls'
import { buildInsightSpec, getInsightEditorDefaults } from '../query'
import { DEFAULT_DASHBOARD_TILE_VIEW_MODE } from '../tile-settings'
import { InsightFields } from './insight-fields'
import { Section } from './section'

type DataTabProps = {
  tile: DashboardTile
  onPatch: (patch: Partial<DashboardTile>) => void
}

// Each insight type puts something different in this section, and "Events" is actively wrong for
// the two that carry none.
const sectionLabel = (insightType: InsightType) => {
  if (insightType === InsightType.TOP_K) return 'Ranking'
  if (insightType === InsightType.USER_FLOW) return 'Flow'
  return 'Events'
}

const COMPARE_OPTIONS = [
  { label: 'No compare', value: ComparePeriod.UNSPECIFIED },
  { label: 'Prior period', value: ComparePeriod.PRIOR },
]

export const DataTab = (props: DataTabProps) => {
  // Remount on tile change so useEventFilters/useFilterState re-seed cleanly.
  return <DataTabInner key={props.tile.id} {...props} />
}

const DataTabInner = ({ tile, onPatch }: DataTabProps) => {
  if (tile.content.case === 'markdown') return <MarkdownDataTab tile={tile} onPatch={onPatch} />
  return <InsightDataTab tile={tile} onPatch={onPatch} />
}

const InsightDataTab = ({ tile, onPatch }: DataTabProps) => {
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  useEffect(() => {
    fetchSchema()
  }, [fetchSchema])

  const defaults = useMemo(() => getInsightEditorDefaults(tile), [tile])
  const [insightType, setInsightType] = useState(defaults.insightType)
  const eventFilters = useEventFilters(defaults.eventEntries)
  const filterState = useFilterState(defaults.propFilters)
  const [breakdowns, setBreakdowns] = useState<string[]>(defaults.breakdowns)
  const [userFlowConfig, setUserFlowConfig] = useState(defaults.userFlowConfig)
  const [topK, setTopK] = useState(defaults.topK)

  // Truncate leftover event rows when switching to an insight type with a smaller
  // event cap (retention = 2, top-k = 1). See eventEntryCap.
  const store = useStore()
  const { filtersAtom, reset: resetEntries } = eventFilters
  useEffect(() => {
    const cap = eventEntryCap(insightType)
    if (cap === undefined) return
    const entries = store.get(filtersAtom)
    if (entries.length <= cap) return
    resetEntries(entries.slice(0, cap))
  }, [insightType, store, filtersAtom, resetEntries])

  const isUserFlow = insightType === InsightType.USER_FLOW

  // User flow narrows by its scope event, if it has one; every other insight type narrows by the
  // events in its rows. Reading the rows for a user-flow tile would intersect property keys across
  // event rows it no longer displays and never sends — silently truncating the property list with
  // the event bar that would explain it off screen. Same rule as the Insights page.
  const schemaEventKinds = () => {
    if (!isUserFlow) return eventFilters.entries.map(entry => entry.kind)
    return userFlowConfig.scope.kind ? [userFlowConfig.scope.kind] : []
  }

  const { schema: globalSchema, schemaError: globalSchemaError } = useGlobalFilterSchema({
    baseSchema: schema,
    baseSchemaError: schemaError,
    selectedEventKinds: schemaEventKinds(),
  })

  useEffect(() => {
    if (tile.content.case !== 'insight') return
    const spec = buildInsightSpec({
      insightType,
      validEntries: eventFilters.validEntries,
      propFilters: filterState.propFilters,
      breakdowns,
      userFlowConfig,
      topK,
    })
    const patch: Partial<DashboardTile> = {
      content: { case: 'insight', value: create(InsightTileContentSchema, { spec }) },
    }
    // Both directions, or the tile strands: Sankey is the only view user flow can take, and the
    // only one no other insight type can render. Switching away used to leave viewMode on SANKEY.
    if (insightType === InsightType.USER_FLOW) {
      if (tile.viewMode !== DashboardTileViewMode.SANKEY) patch.viewMode = DashboardTileViewMode.SANKEY
    } else if (tile.viewMode === DashboardTileViewMode.SANKEY) {
      patch.viewMode = DEFAULT_DASHBOARD_TILE_VIEW_MODE
    }
    onPatch(patch)
    // Exclude `tile` and `onPatch`: this fires only on editor-state changes, not
    // on parent re-renders that produce a new tile object identity. In-place
    // mutation of the same tile from outside the panel will not re-seed local
    // editor state — DataTab is keyed by tile.id so cross-tile switches do
    // re-seed cleanly.
    //
    // The viewMode reconciliation above reads `tile.viewMode` as a decision input, not just as a
    // guard, so it is worth being explicit that the exclusion is still safe: React rebuilds this
    // closure every render and only *runs* the newest one, so the read is never stale, and the
    // silent patch lands synchronously in the draft the `tile` prop derives from. What the
    // exclusion does mean is that the reconciliation is fire-and-forget — a viewMode changed from
    // outside this tab is not corrected until some editor state here changes. Harmless only
    // because the Display tab offers a user-flow tile no view but Sankey.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  }, [insightType, eventFilters.validEntries, filterState.propFilters, breakdowns, userFlowConfig, topK])

  const addBreakdown = (property: string) => {
    setBreakdowns(current => (current.includes(property) || current.length >= 5 ? current : [...current, property]))
  }
  const removeBreakdown = (property: string) => {
    setBreakdowns(current => current.filter(p => p !== property))
  }

  // Per-event measure picker (Total events / Unique users / Sum / …). Only TRENDS
  // supports per-event aggregation; funnel and retention always use total counts.
  const renderRowExtra = useMemo(() => {
    if (insightType !== InsightType.TRENDS) return undefined
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
  }, [insightType, eventFilters.filtersAtom, eventFilters.setAggregation, eventFilters.setAggregationProperty])

  const hasIncompleteNumericAggregation = useMemo(
    () =>
      insightType === InsightType.TRENDS &&
      eventFilters.validEntries.some(entry =>
        isIncompleteNumericAggregation(entry.aggregation, entry.aggregationProperty),
      ),
    [insightType, eventFilters.validEntries],
  )

  return (
    <div className="space-y-4">
      <Section label="Insight type">
        <OptionChip
          label="insight"
          options={INSIGHT_TYPES}
          value={insightType}
          onChange={next => setInsightType(next)}
        />
      </Section>

      <Section label={sectionLabel(insightType)}>
        {insightType === InsightType.USER_FLOW ? (
          <UserFlowControls
            config={userFlowConfig}
            onChange={setUserFlowConfig}
            schema={schema}
            schemaError={schemaError}
            events={schema?.events}
          />
        ) : null}
        <InsightFields
          insightType={insightType}
          schema={schema}
          schemaError={schemaError}
          globalSchema={globalSchema}
          globalSchemaError={globalSchemaError}
          eventFilters={eventFilters}
          filterState={filterState}
          breakdowns={breakdowns}
          addBreakdown={addBreakdown}
          removeBreakdown={removeBreakdown}
          renderRowExtra={renderRowExtra}
          topKEditor={{ value: topK, onChange: setTopK }}
        />
        {hasIncompleteNumericAggregation ? (
          <p className="mt-2 text-xs text-muted-foreground">Select a numeric property to run this aggregation.</p>
        ) : null}
      </Section>

      {tile.viewMode === DashboardTileViewMode.KPI ? (
        <Section label="Compare">
          <OptionChip
            label="compare"
            options={COMPARE_OPTIONS}
            value={tile.compare}
            onChange={next => onPatch({ compare: next })}
          />
        </Section>
      ) : null}
    </div>
  )
}

const MarkdownDataTab = ({ tile, onPatch }: DataTabProps) => {
  if (tile.content.case !== 'markdown') return null
  const body = tile.content.value.body
  return (
    <Section label="Body">
      <textarea
        className="h-48 w-full rounded-md border border-border bg-background p-2 text-sm"
        value={body}
        onChange={e =>
          onPatch({
            content: { case: 'markdown', value: create(MarkdownTileContentSchema, { body: e.target.value }) },
          })
        }
      />
    </Section>
  )
}
