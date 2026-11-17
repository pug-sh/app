import { Bot, Loader2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { trackFeature } from '@/analytics/pug'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { Button } from '@/components/ui/button'
import {
  CRAWLER_CATEGORY_PROPERTY,
  CRAWLER_COMPANY_PROPERTY,
  CRAWLER_NAME_PROPERTY,
  CRAWLER_REQUEST_EVENT,
  CRAWLER_VERIFIED_PROPERTY,
} from '@/lib/crawlers'
import { autoGranularity } from '@/lib/granularity'
import { propertyValueLabel } from '@/lib/property-values'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import { buildCrawlerTopKQuery, buildCrawlerTrendQuery } from './crawler-queries'
import type { GlobalOverrides } from './global-overrides'
import OverviewSectionHeader from './overview-section-header'
import { OverviewTileShell } from './overview-tile-shell'
import { topKToRankedRows } from './traffic-breakdown'
import { TabStrip } from './traffic-breakdown-panel'
import { TrafficFilterBar } from './traffic-filter-bar'
import { filtersExcept, hasFilter, removeFilter, toggleFilter } from './traffic-filters'
import { TrafficRankedList } from './traffic-ranked-list'
import { resolveOverviewDefaultRange } from './url-state'
import { useTrafficQuery } from './use-traffic-query'

const SETUP_DOCS_URL = 'https://docs.pug.sh/crawlers/'

const SECTION_DESCRIPTION = 'AI products, search engines and SEO tools reading your site, as your server reports them.'

type CrawlerTab = { id: string; label: string; property: string; notFound?: boolean }

type CrawlerPanelConfig = { title: string; footer: string; tabs: readonly CrawlerTab[] }

const CRAWLERS_PANEL: CrawlerPanelConfig = {
  title: 'Crawlers',
  footer: 'requests by crawler',
  tabs: [
    { id: 'agent', label: 'Crawlers', property: CRAWLER_NAME_PROPERTY },
    { id: 'company', label: 'Companies', property: CRAWLER_COMPANY_PROPERTY },
    { id: 'category', label: 'Categories', property: CRAWLER_CATEGORY_PROPERTY },
    { id: 'verified', label: 'Verification', property: CRAWLER_VERIFIED_PROPERTY },
  ],
}

const PAGES_PANEL: CrawlerPanelConfig = {
  title: 'Pages',
  footer: 'requests by page · not found is a 404 response',
  tabs: [
    { id: 'pages', label: 'Pages', property: '$pathname' },
    { id: 'notFound', label: 'Not found', property: '$pathname', notFound: true },
  ],
}

const CrawlerPanel = ({
  config,
  range,
  granularity,
  filters,
  reportsStatusCodes,
  onAddFilter,
}: {
  config: CrawlerPanelConfig
  range: TimeRange
  granularity: Granularity
  filters: readonly ActiveFilter[]
  reportsStatusCodes: boolean
  onAddFilter: (property: string, value: string) => void
}) => {
  const [activeId, setActiveId] = useState(config.tabs[0].id)
  const tab = config.tabs.find(candidate => candidate.id === activeId) ?? config.tabs[0]

  const queryFilters = useMemo(() => filtersExcept(filters, tab.property), [filters, tab.property])
  const baseQuery = useMemo(() => buildCrawlerTopKQuery(tab.property, queryFilters, tab.notFound), [tab, queryFilters])
  const { result, error, retry } = useTrafficQuery(baseQuery, range, granularity, `overview-crawlers-${tab.id}`)

  // The previous tab's rows stay in `result` until this one lands, as in TrafficBreakdownPanel.
  const [seen, setSeen] = useState({ result, tabId: tab.id })
  if (seen.result !== result) setSeen({ result, tabId: tab.id })
  const pending = seen.tabId !== tab.id || result.case === undefined

  const rows = useMemo(() => (result.case === 'topK' ? topKToRankedRows(result.value.rows) : []), [result])

  let body
  if (tab.notFound && !reportsStatusCodes) {
    body = (
      <p className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
        No status codes reported, so 404s can't be counted. A Next.js proxy runs before the page and never sees one.
      </p>
    )
  } else if (error) {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    )
  } else if (pending) {
    body = (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground/70" />
      </div>
    )
  } else {
    body = (
      <TrafficRankedList
        rows={rows}
        showShare
        onRowClick={row => onAddFilter(tab.property, row.label)}
        isActive={row => hasFilter(filters, tab.property, row.label)}
        formatLabel={row => (row.muted ? row.label : propertyValueLabel(tab.property, row.label))}
        dimensionLabel={tab.label}
        metricControl="Requests"
      />
    )
  }

  return (
    <OverviewTileShell
      title={config.title}
      footer={config.footer}
      className="min-h-[420px]"
      meta={<TabStrip tabs={config.tabs} activeId={tab.id} onSelect={setActiveId} />}
    >
      <div className="absolute inset-0">{body}</div>
    </OverviewTileShell>
  )
}

const CrawlerSetupHint = () => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <Bot className="mb-3 size-8 opacity-15" />
    <p className="mb-1 text-sm font-medium">No crawler requests yet</p>
    <p className="max-w-md text-[13px] text-muted-foreground">
      Crawlers don't run JavaScript, so the web SDK never sees them. Add{' '}
      <span className="font-mono">@pug-sh/crawlers</span> to your server to see which AI products and search engines
      read your site.{' '}
      <a
        href={SETUP_DOCS_URL}
        target="_blank"
        rel="noreferrer"
        className="text-link hover:underline underline-offset-4"
      >
        Set it up
      </a>
    </p>
  </div>
)

// Not cross-filtered with the traffic view: crawler requests have a page but no geo, device, referrer
// or UTM, so most of its filters would empty this section.
export const CrawlerSection = ({
  hasRequests,
  reportsStatusCodes,
  globalTimeRange,
  globalGranularity,
}: GlobalOverrides & { hasRequests: boolean; reportsStatusCodes: boolean }) => {
  const range = useMemo(() => globalTimeRange ?? resolveOverviewDefaultRange(), [globalTimeRange])
  const granularity = globalGranularity ?? autoGranularity(range)

  const [filters, setFilters] = useState<ActiveFilter[]>([])
  const addFilter = useCallback((property: string, value: string) => {
    trackFeature({ featureId: 'overview.crawlers.filter', featureName: 'Filter crawlers' })
    setFilters(prev => toggleFilter(prev, property, value))
  }, [])
  const dropFilter = useCallback(
    (property: string, value: string) => setFilters(prev => removeFilter(prev, property, value)),
    [],
  )
  const clearFilters = useCallback(() => setFilters([]), [])

  const chartQuery = useMemo(() => buildCrawlerTrendQuery(filters), [filters])
  const panelProps = { range, granularity, filters, reportsStatusCodes, onAddFilter: addFilter }

  return (
    <section className="flex flex-col gap-4">
      <OverviewSectionHeader
        title="AI and search crawlers"
        description={
          hasRequests ? `${SECTION_DESCRIPTION} Click any value to filter this section.` : SECTION_DESCRIPTION
        }
      />
      {hasRequests ? (
        <>
          <TrafficFilterBar filters={filters} onRemove={dropFilter} onClear={clearFilters} />
          <OverviewTileShell
            title="Crawler requests"
            footer={`by category · via ${CRAWLER_REQUEST_EVENT}`}
            contentClassName="flex flex-col"
            className="h-[360px]"
          >
            <div className="min-h-0 flex-1">
              <DashboardInsightContent
                query={chartQuery}
                defaultTimeRange={undefined}
                timeRangeOverride={range}
                granularityOverride={granularity}
                viewMode={DashboardTileViewMode.BAR_STACKED}
                queryKeyPrefix="overview-crawlers-chart"
                compact
                lightMetrics
              />
            </div>
          </OverviewTileShell>
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <CrawlerPanel config={CRAWLERS_PANEL} {...panelProps} />
            <CrawlerPanel config={PAGES_PANEL} {...panelProps} />
          </div>
        </>
      ) : (
        <CrawlerSetupHint />
      )}
    </section>
  )
}
