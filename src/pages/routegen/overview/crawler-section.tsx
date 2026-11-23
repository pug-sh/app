import { Bot } from 'lucide-react'
import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { trackFeature } from '@/analytics/pug'
import { type Granularity, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { DomainFavicon } from '@/components/domain-favicon'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { CRAWLER_CATEGORY_PROPERTY, CRAWLER_REQUEST_EVENT, STATUS_CODE_PROPERTY } from '@/lib/crawlers'
import { compactNumber } from '@/lib/format'
import { autoGranularity } from '@/lib/granularity'
import { emptyValueLabel, propertyValueLabel } from '@/lib/property-values'
import { cn } from '@/lib/utils'
import { isOthersBreakdown, OTHERS_LABEL } from '../insights/helpers'
import {
  buildAiVisitsBreakdownQuery,
  buildAiVisitsQuery,
  buildCrawlerPagesQuery,
  buildCrawlerProblemsQuery,
  buildCrawlerPurposeQuery,
  CRAWLER_PURPOSES,
  type CrawlerPurpose,
} from './crawler-queries'
import { CrawlerTable } from './crawler-table'
import type { GlobalOverrides } from './global-overrides'
import OverviewSectionHeader from './overview-section-header'
import { OverviewTileShell } from './overview-tile-shell'
import { StatTile } from './stat-tile'
import { type RankedRow, rankSessionBreakdown, topKToRankedRows } from './traffic-breakdown'
import { PanelBody, TabStrip } from './traffic-breakdown-panel'
import { TrafficChartTile } from './traffic-chart-tile'
import { TrafficFilterBar } from './traffic-filter-bar'
import { filtersExcept, hasFilter, removeFilter, toggleFilter } from './traffic-filters'
import { TrafficRankedList } from './traffic-ranked-list'
import { resolveOverviewDefaultRange } from './url-state'
import { useTrafficQuery } from './use-traffic-query'

const SETUP_DOCS_URL = 'https://docs.pug.sh/crawlers/'

const SECTION_DESCRIPTION =
  'What AI products, search engines and SEO tools do with your site, as your server reports them, and the visits AI sends you.'

const PURPOSE_DESCRIPTIONS: Record<CrawlerPurpose, string> = {
  answers: 'Fetched live because someone asked an AI product',
  search: 'Builds a search index that results and AI answers draw on',
  training: 'Collects pages to train models',
  seo: 'Crawls for an SEO tool',
}

const AI_VISITS = 'aiVisits'
const AI_VISITS_LABEL = 'Visits from AI'

type TileId = CrawlerPurpose | typeof AI_VISITS

const purposeLabel = (purpose: CrawlerPurpose) => propertyValueLabel(CRAWLER_CATEGORY_PROPERTY, purpose)

type Period = { range: TimeRange; granularity: Granularity }

const PurposeTile = ({
  purpose,
  selected,
  onSelect,
  filters,
  range,
  granularity,
}: Period & {
  purpose: CrawlerPurpose
  selected: boolean
  onSelect: (id: TileId) => void
  filters: readonly ActiveFilter[]
}) => {
  const scalarQuery = useMemo(
    () => buildCrawlerPurposeQuery(purpose, InsightType.SEGMENTATION, filters),
    [purpose, filters],
  )
  const trendQuery = useMemo(() => buildCrawlerPurposeQuery(purpose, InsightType.TRENDS, filters), [purpose, filters])
  return (
    <StatTile
      label={purposeLabel(purpose)}
      description={PURPOSE_DESCRIPTIONS[purpose]}
      scalarQuery={scalarQuery}
      trendQuery={trendQuery}
      formatValue={compactNumber}
      selected={selected}
      onSelect={() => onSelect(purpose)}
      range={range}
      granularity={granularity}
      queryKeyPrefix={`overview-crawlers-stat-${purpose}`}
    />
  )
}

// People, not crawlers, so the section's crawler filters don't apply.
const AiVisitsTile = ({
  navName,
  selected,
  onSelect,
  range,
  granularity,
}: Period & { navName: string; selected: boolean; onSelect: (id: TileId) => void }) => {
  const scalarQuery = useMemo(() => buildAiVisitsQuery(navName, InsightType.SEGMENTATION), [navName])
  const trendQuery = useMemo(() => buildAiVisitsQuery(navName, InsightType.TRENDS), [navName])
  return (
    <StatTile
      label={AI_VISITS_LABEL}
      description="Visits sent by ChatGPT, Perplexity, Claude, Gemini and other AI products"
      scalarQuery={scalarQuery}
      trendQuery={trendQuery}
      formatValue={compactNumber}
      selected={selected}
      onSelect={() => onSelect(AI_VISITS)}
      range={range}
      granularity={granularity}
      queryKeyPrefix="overview-crawlers-stat-ai-visits"
    />
  )
}

const PAGE_TABS = [
  { id: 'all', label: 'All', footer: 'requests by page' },
  { id: 'answers', label: 'Answered from', footer: 'pages AI answers fetched', purpose: 'answers' },
  { id: 'training', label: 'Trained on', footer: 'pages training crawlers took', purpose: 'training' },
  { id: 'problems', label: 'Problems', footer: 'error responses by page and status' },
] as const

type PageRow = RankedRow & { status?: string }

const statusLeading = (row: PageRow) => (
  <span className="w-7 shrink-0 font-mono text-negative tabular-nums">{row.muted ? null : row.status}</span>
)

const sourceLeading = (row: RankedRow) =>
  row.muted ? <span className="size-4 shrink-0" /> : <DomainFavicon domain={row.label} />

const CrawlerPagesPanel = ({
  filters,
  reportsStatusCodes,
  onAddFilter,
  range,
  granularity,
}: Period & {
  filters: readonly ActiveFilter[]
  reportsStatusCodes: boolean
  onAddFilter: (property: string, value: string) => void
}) => {
  const [activeId, setActiveId] = useState<(typeof PAGE_TABS)[number]['id']>('all')
  const tab = PAGE_TABS.find(candidate => candidate.id === activeId) ?? PAGE_TABS[0]
  const problems = tab.id === 'problems'

  const queryFilters = useMemo(() => filtersExcept(filters, '$pathname'), [filters])
  const baseQuery = useMemo(() => {
    if (problems) return buildCrawlerProblemsQuery(queryFilters)
    return buildCrawlerPagesQuery('purpose' in tab ? tab.purpose : undefined, queryFilters)
  }, [problems, tab, queryFilters])
  const { result, error, retry } = useTrafficQuery(baseQuery, range, granularity, `overview-crawlers-pages-${tab.id}`)

  // One page can fail with more than one status, so a problem row is keyed by both.
  const rows = useMemo<PageRow[]>(() => {
    const emptyLabel = emptyValueLabel('$pathname')
    if (result.case === 'topK') return topKToRankedRows(result.value.rows, emptyLabel)
    if (result.case !== 'trends') return []
    return result.value.series
      .map(series => {
        const path = series.breakdown.$pathname ?? ''
        const status = series.breakdown[STATUS_CODE_PROPERTY] ?? ''
        const value = series.points.reduce((sum, point) => sum + point.value, 0)
        const others = isOthersBreakdown(series.breakdown)
        const label = others ? OTHERS_LABEL : path || emptyLabel
        return { key: `${path}\u0000${status}`, label, value, muted: others || !path, status }
      })
      .sort((a, b) => b.value - a.value)
  }, [result])

  let body: ReactNode
  if (problems && !reportsStatusCodes) {
    body = (
      <p className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
        No status codes reported, so errors can't be counted. A Next.js proxy runs before the page and never sees one.
      </p>
    )
  } else {
    body = (
      <PanelBody error={error} retry={retry} pending={result.case === undefined}>
        <TrafficRankedList
          rows={rows}
          showShare={!problems}
          onRowClick={row => onAddFilter('$pathname', row.label)}
          isActive={row => hasFilter(filters, '$pathname', row.label)}
          renderLeading={problems ? statusLeading : undefined}
          dimensionLabel="Page"
          metricControl="Requests"
        />
      </PanelBody>
    )
  }

  return (
    <OverviewTileShell
      title="Pages"
      footer={tab.footer}
      className="min-h-[420px]"
      meta={<TabStrip tabs={PAGE_TABS} activeId={tab.id} onSelect={setActiveId} />}
    >
      <div className="absolute inset-0">{body}</div>
    </OverviewTileShell>
  )
}

const AI_VISIT_TABS = [
  { id: 'sources', label: 'Sources', property: '$referrerDomain', dimension: 'Source' },
  { id: 'landing', label: 'Landing pages', property: '$pathname', dimension: 'Page' },
] as const

const AI_VISIT_LIMIT = 50

const AiVisitsPanel = ({ navName, range, granularity }: Period & { navName: string }) => {
  const [activeId, setActiveId] = useState<(typeof AI_VISIT_TABS)[number]['id']>('sources')
  const tab = AI_VISIT_TABS.find(candidate => candidate.id === activeId) ?? AI_VISIT_TABS[0]
  const baseQuery = useMemo(() => buildAiVisitsBreakdownQuery(navName, tab.property), [navName, tab])
  const { result, error, retry } = useTrafficQuery(baseQuery, range, granularity, `overview-ai-visits-${tab.id}`)
  const rows = useMemo(
    () => (result.case === 'trends' ? rankSessionBreakdown(result.value.series, AI_VISIT_LIMIT) : []),
    [result],
  )

  return (
    <OverviewTileShell
      title={AI_VISITS_LABEL}
      footer="visits by where they started"
      className="min-h-[420px]"
      meta={<TabStrip tabs={AI_VISIT_TABS} activeId={tab.id} onSelect={setActiveId} />}
    >
      <div className="absolute inset-0">
        <PanelBody error={error} retry={retry} pending={result.case === undefined}>
          <TrafficRankedList
            rows={rows}
            renderLeading={tab.id === 'sources' ? sourceLeading : undefined}
            dimensionLabel={tab.dimension}
            metricControl="Visits"
          />
        </PanelBody>
      </div>
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
  navName,
  globalTimeRange,
  globalGranularity,
}: GlobalOverrides & { hasRequests: boolean; reportsStatusCodes: boolean; navName?: string }) => {
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

  const [selected, setSelected] = useState<TileId>('answers')
  const visitsNav = selected === AI_VISITS ? navName : undefined
  const chartPurpose = selected === AI_VISITS ? 'answers' : selected
  const chartQuery = useMemo(() => {
    if (visitsNav) return buildAiVisitsQuery(visitsNav, InsightType.TRENDS)
    return buildCrawlerPurposeQuery(chartPurpose, InsightType.TRENDS, filters)
  }, [visitsNav, chartPurpose, filters])

  const period = { range, granularity }

  return (
    <section className="flex flex-col gap-4">
      <OverviewSectionHeader
        title="AI and search crawlers"
        description={
          hasRequests ? `${SECTION_DESCRIPTION} Click a crawler or a page to filter this section.` : SECTION_DESCRIPTION
        }
      />
      {hasRequests ? (
        <>
          <TrafficFilterBar filters={filters} onRemove={dropFilter} onClear={clearFilters} />
          <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', navName ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
            {CRAWLER_PURPOSES.map(purpose => (
              <PurposeTile
                key={purpose}
                purpose={purpose}
                selected={!visitsNav && purpose === chartPurpose}
                onSelect={setSelected}
                filters={filters}
                {...period}
              />
            ))}
            {navName && <AiVisitsTile navName={navName} selected={!!visitsNav} onSelect={setSelected} {...period} />}
          </div>
          <TrafficChartTile
            statLabel={visitsNav ? AI_VISITS_LABEL : purposeLabel(chartPurpose)}
            navName={visitsNav || CRAWLER_REQUEST_EVENT}
            query={chartQuery}
            queryKeyPrefix={`overview-crawlers-chart-${visitsNav ? AI_VISITS : chartPurpose}`}
            {...period}
          />
          <CrawlerTable filters={filters} reportsStatusCodes={reportsStatusCodes} onAddFilter={addFilter} {...period} />
          <div className={cn('grid grid-cols-1 gap-3.5', navName && 'lg:grid-cols-2')}>
            <CrawlerPagesPanel
              filters={filters}
              reportsStatusCodes={reportsStatusCodes}
              onAddFilter={addFilter}
              {...period}
            />
            {navName && <AiVisitsPanel navName={navName} {...period} />}
          </div>
        </>
      ) : (
        <CrawlerSetupHint />
      )}
    </section>
  )
}
