import { create } from '@bufbuild/protobuf'
import { useAtomValue, useSetAtom } from 'jotai'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  ComparePeriod,
  type DashboardTile,
  DashboardTileViewMode,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { useEventFilters } from '@/hooks/use-event-filters'
import { useFilterState } from '@/hooks/use-filter-state'
import { useGlobalFilterSchema } from '@/hooks/use-global-filter-schema'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../../events/filter-schema.atoms'
import { INSIGHT_TYPES } from '../../insights/constants'
import { OptionChip } from '../../insights/controls'
import { buildInsightSpec, getInsightEditorDefaults } from '../query'
import { InsightFields } from './insight-fields'

type DataTabProps = {
  tile: DashboardTile
  onPatch: (patch: Partial<DashboardTile>) => void
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

  const { schema: globalSchema, schemaError: globalSchemaError } = useGlobalFilterSchema({
    baseSchema: schema,
    baseSchemaError: schemaError,
    selectedEventKinds: eventFilters.entries.map(entry => entry.kind),
  })

  useEffect(() => {
    if (tile.content.case !== 'insight') return
    const spec = buildInsightSpec({
      insightType,
      validEntries: eventFilters.validEntries,
      propFilters: filterState.propFilters,
      breakdowns,
    })
    onPatch({
      content: { case: 'insight', value: create(InsightTileContentSchema, { spec }) },
    })
    // Exclude `tile` and `onPatch`: this fires only on editor-state changes, not
    // on parent re-renders that produce a new tile object identity. In-place
    // mutation of the same tile from outside the panel will not re-seed local
    // editor state — DataTab is keyed by tile.id so cross-tile switches do
    // re-seed cleanly.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  }, [insightType, eventFilters.validEntries, filterState.propFilters, breakdowns])

  const addBreakdown = (property: string) => {
    setBreakdowns(current => (current.includes(property) || current.length >= 5 ? current : [...current, property]))
  }
  const removeBreakdown = (property: string) => {
    setBreakdowns(current => current.filter(p => p !== property))
  }

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

      <Section label="Events">
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
        />
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

const Section = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    {children}
  </div>
)
