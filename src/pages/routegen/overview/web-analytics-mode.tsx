import { Globe } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { AggregationType, InsightType, SessionMetric } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import {
  insightsEventFiltersSearch,
  readPropFiltersParam,
  writePropFiltersParam,
} from '@/hooks/use-filter-query-params'
import { autoGranularity } from '@/lib/granularity'
import { useProjectNavigate } from '@/lib/project-path'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import type { GlobalOverrides } from './global-overrides'
import OverviewSectionHeader from './overview-section-header'
import { OverviewTileShell } from './overview-tile-shell'
import { resolveWebDefaultRange } from './url-state'
import {
  buildWebStatQuery,
  COUNTRY_PROPERTY,
  getWebStat,
  WEB_PRIMARY_KIND,
  WEB_STATS,
  type WebStatId,
} from './web-analytics-queries'
import { type BreakdownPanelConfig, WebBreakdownPanel } from './web-breakdown-panel'
import { WebFilterBar } from './web-filter-bar'
import { removeFilter as removeFilterValue, toggleFilter, toggleSingleFilter } from './web-filters'
import { WebMapPanel } from './web-map-panel'
import { WebStatTile } from './web-stat-tile'

// Breakdown panels backed by data the currently-deployed backend already feeds. Two migration-009
// derived properties are wired here: Pages/Entry/Exit key on $pathname (the path alone, so a page
// groups across scheme, host, and query string), and the Referrer tab keys on $referrerDomain
// (referrer host, www-stripped, blanked on self-referral — not the raw, high-cardinality $referrer,
// which the backend promotes but deliberately never rolls up). The remaining derived-property panels
// from the web-analytics design (Channels/$channel, Screens, Languages) stay a fast-follow — a
// property-string swap here, no structural change.
const PAGES_PANEL: BreakdownPanelConfig = {
  title: 'Pages',
  footer: 'pageviews by page · sessions for entry / exit',
  tabs: [
    { id: 'pages', label: 'Pages', source: 'property', property: '$pathname', metric: AggregationType.TOTAL },
    { id: 'entry', label: 'Entry', source: 'session', metric: SessionMetric.ENTRY, property: '$pathname' },
    { id: 'exit', label: 'Exit', source: 'session', metric: SessionMetric.EXIT, property: '$pathname' },
  ],
}

const SOURCES_PANEL: BreakdownPanelConfig = {
  title: 'Sources',
  footer: 'unique visitors by referrer / UTM',
  tabs: [
    {
      id: 'referrer',
      label: 'Referrer',
      source: 'property',
      property: '$referrerDomain',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'domain',
    },
    {
      id: 'source',
      label: 'Source',
      source: 'property',
      property: '$utmSource',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'source',
    },
    { id: 'medium', label: 'Medium', source: 'property', property: '$utmMedium', metric: AggregationType.UNIQUE_USERS },
    {
      id: 'campaign',
      label: 'Campaign',
      source: 'property',
      property: '$utmCampaign',
      metric: AggregationType.UNIQUE_USERS,
    },
  ],
}

const LOCATIONS_PANEL: BreakdownPanelConfig = {
  title: 'Locations',
  footer: 'unique visitors by geography',
  tabs: [
    {
      id: 'country',
      label: 'Countries',
      source: 'property',
      property: '$country',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'country',
    },
    { id: 'region', label: 'Regions', source: 'property', property: '$region', metric: AggregationType.UNIQUE_USERS },
    { id: 'city', label: 'Cities', source: 'property', property: '$city', metric: AggregationType.UNIQUE_USERS },
  ],
}

const DEVICES_PANEL: BreakdownPanelConfig = {
  title: 'Devices',
  footer: 'unique visitors by device',
  tabs: [
    {
      id: 'browser',
      label: 'Browser',
      source: 'property',
      property: '$browser',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'browser',
    },
    {
      id: 'os',
      label: 'OS',
      source: 'property',
      property: '$os',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'os',
    },
    {
      id: 'device',
      label: 'Device',
      source: 'property',
      property: '$device',
      metric: AggregationType.UNIQUE_USERS,
      valueKind: 'device',
    },
  ],
}

const EVENTS_PANEL: BreakdownPanelConfig = {
  title: 'Events',
  footer: 'across all events · click to open in Insights',
  tabs: [{ id: 'events', label: 'Events', source: 'eventKind' }],
}

type Props = GlobalOverrides & {
  schema: GetFilterSchemaResponse
  selectedStat: WebStatId
  onSelectStat: (id: WebStatId) => void
}

const WebAnalyticsMode = ({ schema, selectedStat, onSelectStat, globalTimeRange, globalGranularity }: Props) => {
  // Web analytics is defined around the pageview; without it every panel is empty.
  const hasPageViews = schema.events.some(event => event.name === WEB_PRIMARY_KIND)

  // Resolve one concrete window + granularity for the whole view so every panel agrees. Default to
  // Today when no global range is set; Auto resolves to hourly there.
  const range = useMemo(() => globalTimeRange ?? resolveWebDefaultRange(), [globalTimeRange])
  const granularity = globalGranularity ?? autoGranularity(range)

  // Cross-filters: clicking any breakdown value (or a country on the map) narrows the whole view.
  // These reuse the Insights property-filter model and its shared `pf` URL param, so a filtered view
  // is shareable and survives reload.
  const [filters, setFilters] = useState<ActiveFilter[]>(() => readPropFiltersParam())
  useEffect(() => {
    writePropFiltersParam(filters)
  }, [filters])
  // Country is single-select (a one-country drilldown, entered from the map or the Countries list);
  // every other dimension multi-toggles.
  const addFilter = useCallback(
    (property: string, value: string) =>
      setFilters(prev =>
        property === COUNTRY_PROPERTY ? toggleSingleFilter(prev, property, value) : toggleFilter(prev, property, value),
      ),
    [],
  )
  const removeFilter = useCallback(
    (property: string, value: string) => setFilters(prev => removeFilterValue(prev, property, value)),
    [],
  )
  const clearFilters = useCallback(() => setFilters([]), [])

  // Events aren't a cross-filter dimension (the whole view is page_view-scoped), so an event row drills
  // through to Insights pre-loaded with that event via the shared `ef` param, rather than filtering here.
  const navigate = useProjectNavigate()
  const openEventInInsights = useCallback(
    (kind: string) => navigate(`/insights?${insightsEventFiltersSearch([kind])}`),
    [navigate],
  )

  const chartQuery = useMemo(
    () => buildWebStatQuery(selectedStat, InsightType.TRENDS, filters),
    [selectedStat, filters],
  )

  if (!hasPageViews) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Globe className="mb-4 size-10 opacity-15" />
        <p className="mb-1 text-sm font-medium">Web analytics needs pageview events</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          This project has no <span className="font-mono">page_view</span> events yet. Send pageviews with the web SDK,
          or switch to Product analytics for an event-based overview.
        </p>
      </div>
    )
  }

  // Shared by every breakdown/map panel; only config + queryKeyPrefix (and the events panel's
  // onEventClick) differ per panel.
  const panelProps = { range, granularity, filters, onAddFilter: addFilter }

  return (
    <div className="flex flex-col gap-9">
      <section className="flex flex-col gap-3.5">
        <WebFilterBar filters={filters} onRemove={removeFilter} onClear={clearFilters} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {WEB_STATS.map(stat => (
            <WebStatTile
              key={stat.id}
              statId={stat.id}
              selected={stat.id === selectedStat}
              onSelect={onSelectStat}
              range={range}
              granularity={granularity}
              filters={filters}
            />
          ))}
        </div>

        <OverviewTileShell
          title={getWebStat(selectedStat).label}
          footer={`via ${WEB_PRIMARY_KIND}`}
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
              queryKeyPrefix={`overview-web-chart-${selectedStat}`}
              compact
              lightMetrics
              hideSummary
            />
          </div>
        </OverviewTileShell>
      </section>

      <section className="flex flex-col gap-4">
        <OverviewSectionHeader title="Breakdowns" description="Click any value to filter the whole view." />
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <WebBreakdownPanel config={PAGES_PANEL} queryKeyPrefix="overview-web-pages" {...panelProps} />
          <WebBreakdownPanel config={SOURCES_PANEL} queryKeyPrefix="overview-web-sources" {...panelProps} />
          <WebMapPanel queryKeyPrefix="overview-web-map" {...panelProps} />
          <WebBreakdownPanel config={LOCATIONS_PANEL} queryKeyPrefix="overview-web-locations" {...panelProps} />
          <WebBreakdownPanel config={DEVICES_PANEL} queryKeyPrefix="overview-web-devices" {...panelProps} />
          <WebBreakdownPanel
            config={EVENTS_PANEL}
            queryKeyPrefix="overview-web-events"
            onEventClick={openEventInInsights}
            {...panelProps}
          />
        </div>
      </section>
    </div>
  )
}

export default WebAnalyticsMode
