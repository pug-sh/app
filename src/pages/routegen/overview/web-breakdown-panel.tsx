import { useMemo, useState } from 'react'
import type { AggregationType, Granularity, SessionMetric } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { OverviewTileShell } from './overview-tile-shell'
import { useWebQuery } from './use-web-query'
import { buildEventKindTopKQuery, buildSessionBreakdownQuery, buildTopKBreakdownQuery } from './web-analytics-queries'
import { type RankedRow, rankSessionBreakdown, topKToRankedRows } from './web-breakdown'
import { filtersExcept, hasFilter } from './web-filters'
import { WebRankedList } from './web-ranked-list'

const SESSION_BREAKDOWN_LIMIT = 50

// A tab is one ranked view within a panel. `property` tabs rank an auto-property via top-K;
// `eventKind` ranks event kinds; `session` ranks entry/exit pages from a session breakdown. Kept as
// plain data (no closures) so a panel's tab list can be a stable module constant.
export type BreakdownTab = { id: string; label: string } & (
  | { source: 'property'; property: string; metric: AggregationType }
  | { source: 'eventKind' }
  | { source: 'session'; metric: SessionMetric.ENTRY | SessionMetric.EXIT; property: string }
)

export type BreakdownPanelConfig = {
  title: string
  footer: string
  tabs: readonly BreakdownTab[]
}

// The auto-property a tab's rows filter on, or undefined for event-kind rows (not cross-filterable).
const tabFilterProperty = (tab: BreakdownTab) => (tab.source === 'eventKind' ? undefined : tab.property)

const buildTabQuery = (tab: BreakdownTab, filters: readonly ActiveFilter[]) => {
  if (tab.source === 'property') return buildTopKBreakdownQuery(tab.property, tab.metric, filters)
  if (tab.source === 'eventKind') return buildEventKindTopKQuery(filters)
  return buildSessionBreakdownQuery(tab.metric, tab.property, filters)
}

const TabStrip = ({
  tabs,
  activeId,
  onSelect,
}: {
  tabs: readonly BreakdownTab[]
  activeId: string
  onSelect: (id: string) => void
}) => (
  <div className="flex shrink-0 items-center gap-0.5">
    {tabs.map(tab => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onSelect(tab.id)}
        className={cn(
          'rounded px-1.5 py-0.5 text-[11px] transition-colors',
          tab.id === activeId ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {tab.label}
      </button>
    ))}
  </div>
)

export const WebBreakdownPanel = ({
  config,
  range,
  granularity,
  queryKeyPrefix,
  filters,
  onAddFilter,
  onEventClick,
}: {
  config: BreakdownPanelConfig
  range: TimeRange
  granularity: Granularity
  queryKeyPrefix: string
  filters: readonly ActiveFilter[]
  onAddFilter: (property: string, value: string) => void
  // Event-kind rows aren't cross-filterable; when provided, clicking one drills through (e.g. to Insights).
  onEventClick?: (kind: string) => void
}) => {
  const [activeId, setActiveId] = useState(config.tabs[0].id)
  const tab = config.tabs.find(candidate => candidate.id === activeId) ?? config.tabs[0]
  const isTopK = tab.source !== 'session'
  const selfProperty = tabFilterProperty(tab)

  // Apply page filters except this panel's own dimension, so every value of it stays visible and
  // togglable while the rest of the filter set still narrows the list.
  const queryFilters = useMemo(() => filtersExcept(filters, selfProperty), [filters, selfProperty])
  const baseQuery = useMemo(() => buildTabQuery(tab, queryFilters), [tab, queryFilters])
  const { result, error, retry } = useWebQuery(baseQuery, range, granularity, `${queryKeyPrefix}-${tab.id}`)

  const rows = useMemo<RankedRow[]>(() => {
    if (tab.source === 'session') {
      return result.case === 'trends' ? rankSessionBreakdown(result.value.series, SESSION_BREAKDOWN_LIMIT) : []
    }
    return result.case === 'topK' ? topKToRankedRows(result.value.rows) : []
  }, [tab.source, result])

  // Property rows cross-filter the view; event-kind rows drill through (no filter, so no active state).
  let onRowClick: ((row: RankedRow) => void) | undefined
  if (selfProperty) onRowClick = row => onAddFilter(selfProperty, row.label)
  else if (tab.source === 'eventKind' && onEventClick) onRowClick = row => onEventClick(row.label)
  const isActive = selfProperty ? (row: RankedRow) => hasFilter(filters, selfProperty, row.label) : undefined

  return (
    <OverviewTileShell
      title={config.title}
      footer={config.footer}
      className="h-[420px]"
      contentClassName="flex flex-col"
      meta={config.tabs.length > 1 ? <TabStrip tabs={config.tabs} activeId={tab.id} onSelect={setActiveId} /> : null}
    >
      <div className="min-h-0 flex-1">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : (
          <WebRankedList rows={rows} showShare={isTopK} onRowClick={onRowClick} isActive={isActive} />
        )}
      </div>
    </OverviewTileShell>
  )
}
