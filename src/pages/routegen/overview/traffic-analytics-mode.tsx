import { Route } from 'lucide-react'
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { trackFeature } from '@/analytics/pug'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { insightsEventFiltersSearch, writePropFiltersParam } from '@/hooks/use-filter-query-params'
import { autoGranularity } from '@/lib/granularity'
import { useProjectNavigate } from '@/lib/project-path'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import type { GlobalOverrides } from './global-overrides'
import OverviewSectionHeader from './overview-section-header'
import { OverviewTileShell } from './overview-tile-shell'
import { TrafficBreakdownPanel } from './traffic-breakdown-panel'
import { TrafficFilterBar } from './traffic-filter-bar'
import {
  readTrafficFilters,
  removeFilter as removeFilterValue,
  toggleFilter,
  toggleSingleFilter,
} from './traffic-filters'
import { TrafficMapPanel } from './traffic-map-panel'
import { trafficPanels } from './traffic-panels'
import {
  buildTrafficStatQuery,
  COUNTRY_PROPERTY,
  getTrafficStat,
  type NavEvent,
  resolveNavEvent,
  TRAFFIC_STATS,
  type TrafficStatId,
} from './traffic-queries'
import { TrafficStatTile } from './traffic-stat-tile'
import { resolveOverviewDefaultRange } from './url-state'

type Props = GlobalOverrides & {
  schema: GetFilterSchemaResponse
  selectedStat: TrafficStatId
  onSelectStat: (id: TrafficStatId) => void
}

const TrafficAnalyticsMode = ({ schema, ...props }: Props) => {
  const nav = useMemo(() => resolveNavEvent(schema.events), [schema.events])

  // Above the empty state, not inside the view: the write-back rewrites `pf` from what was restored,
  // so a link this view can't honour is warned about and cleaned up on either branch.
  const restored = useMemo(() => readTrafficFilters(), [])
  useEffect(() => {
    if (restored.parseWarning) toast.warning(restored.parseWarning, { id: 'traffic-filter-parse-warning' })
  }, [restored])

  const [filters, setFilters] = useState<ActiveFilter[]>(restored.filters)
  useEffect(() => {
    writePropFiltersParam(filters)
  }, [filters])

  if (!nav) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Route className="mb-4 size-10 opacity-15" />
        <p className="mb-1 text-sm font-medium">Traffic analytics needs navigation events</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          This project has no <span className="font-mono">page_view</span> or{' '}
          <span className="font-mono">screen_view</span> events yet. Send them with the web or Flutter SDK, or switch to
          Product analytics for an event-based overview.
        </p>
      </div>
    )
  }

  return <TrafficAnalyticsView nav={nav} filters={filters} setFilters={setFilters} {...props} />
}

const TrafficAnalyticsView = ({
  nav,
  filters,
  setFilters,
  selectedStat,
  onSelectStat,
  globalTimeRange,
  globalGranularity,
}: Omit<Props, 'schema'> & {
  nav: NavEvent
  filters: ActiveFilter[]
  setFilters: Dispatch<SetStateAction<ActiveFilter[]>>
}) => {
  const panels = trafficPanels(nav.kind)

  // One window + granularity for the whole view so every panel agrees.
  const range = useMemo(() => globalTimeRange ?? resolveOverviewDefaultRange(), [globalTimeRange])
  const granularity = globalGranularity ?? autoGranularity(range)

  const addFilter = useCallback(
    (property: string, value: string) => {
      // Id predates the web → traffic rename; renaming it would end the shipped series and restart it
      // at zero with no backfill.
      trackFeature({ featureId: 'overview.web.filter', featureName: 'Filter traffic analytics' })
      setFilters(prev =>
        property === COUNTRY_PROPERTY ? toggleSingleFilter(prev, property, value) : toggleFilter(prev, property, value),
      )
    },
    [setFilters],
  )
  const removeFilter = useCallback(
    (property: string, value: string) => setFilters(prev => removeFilterValue(prev, property, value)),
    [setFilters],
  )
  const clearFilters = useCallback(() => setFilters([]), [setFilters])

  // Events aren't a cross-filter dimension (the whole view is navigation-scoped), so an event row
  // drills through to Insights rather than filtering here.
  const navigate = useProjectNavigate()
  const openEventInInsights = useCallback(
    (kind: string) => navigate(`/insights?${insightsEventFiltersSearch([kind])}`),
    [navigate],
  )

  const chartQuery = useMemo(
    () => buildTrafficStatQuery(nav.name, selectedStat, InsightType.TRENDS, filters),
    [nav, selectedStat, filters],
  )

  const statLabel = getTrafficStat(selectedStat).label[nav.kind]

  const panelProps = { nav, range, granularity, filters, onAddFilter: addFilter }

  return (
    <div className="flex flex-col gap-9">
      <section className="flex flex-col gap-3.5">
        <TrafficFilterBar filters={filters} onRemove={removeFilter} onClear={clearFilters} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {TRAFFIC_STATS.map(stat => (
            <TrafficStatTile
              key={stat.id}
              statId={stat.id}
              nav={nav}
              selected={stat.id === selectedStat}
              onSelect={onSelectStat}
              range={range}
              granularity={granularity}
              filters={filters}
            />
          ))}
        </div>

        <OverviewTileShell
          title={statLabel}
          footer={`via ${nav.name}`}
          contentClassName="flex flex-col"
          className="h-[320px]"
        >
          <div className="min-h-0 flex-1">
            <DashboardInsightContent
              query={chartQuery}
              defaultTimeRange={undefined}
              timeRangeOverride={range}
              granularityOverride={granularity}
              viewMode={DashboardTileViewMode.AREA}
              queryKeyPrefix={`overview-traffic-chart-${selectedStat}`}
              comparePrior
              compact
              lightMetrics
              hideSummary
              seriesLabel={statLabel}
            />
          </div>
        </OverviewTileShell>
      </section>

      <section className="flex flex-col gap-4">
        <OverviewSectionHeader title="Breakdowns" description="Click any value to filter the whole view." />
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <TrafficBreakdownPanel
            config={panels.destinations}
            queryKeyPrefix="overview-traffic-destinations"
            {...panelProps}
          />
          <TrafficBreakdownPanel config={panels.sources} queryKeyPrefix="overview-traffic-sources" {...panelProps} />
          <TrafficMapPanel footer={panels.mapFooter} queryKeyPrefix="overview-traffic-map" {...panelProps} />
          <TrafficBreakdownPanel
            config={panels.locations}
            queryKeyPrefix="overview-traffic-locations"
            {...panelProps}
          />
          <TrafficBreakdownPanel config={panels.devices} queryKeyPrefix="overview-traffic-devices" {...panelProps} />
          <TrafficBreakdownPanel
            config={panels.events}
            queryKeyPrefix="overview-traffic-events"
            onEventClick={openEventInInsights}
            {...panelProps}
          />
        </div>
      </section>
    </div>
  )
}

export default TrafficAnalyticsMode
