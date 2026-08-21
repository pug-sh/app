import { ArrowLeftRight, Loader2 } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { AggregationType, type Granularity, type SessionMetric } from '@/api/genproto/shared/insights/v1/insights_pb'
import { BrandIcon, UnknownBrowserIcon } from '@/components/brand-icon'
import { CountryFlag } from '@/components/country-flag'
import type { TimeRange } from '@/components/date-range-picker'
import { DomainFavicon } from '@/components/domain-favicon'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BRAND_ICON_RESOLVERS, type BrandValueKind } from '@/lib/brand-icons'
import { formatCountryName } from '@/lib/location'
import { cn } from '@/lib/utils'
import { OverviewTileShell } from './overview-tile-shell'
import { type RankedRow, rankSessionBreakdown, topKToRankedRows } from './traffic-breakdown'
import { filtersExcept, hasFilter } from './traffic-filters'
import {
  buildEventKindTopKQuery,
  buildSessionBreakdownQuery,
  buildTopKBreakdownQuery,
  getTrafficStat,
  type NavEvent,
} from './traffic-queries'
import { TrafficRankedList } from './traffic-ranked-list'
import { useTrafficQuery } from './use-traffic-query'
import { utmSourceDomain } from './utm-source-domains'

const SESSION_BREAKDOWN_LIMIT = 50

const OS_LABELS: Record<string, string> = {
  ios: 'iOS',
  android: 'Android',
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  fuchsia: 'Fuchsia',
}

// Plain data (no closures) so a panel's tab list stays a module constant.
export type BreakdownTab = { id: string; label: string } & (
  | {
      source: 'property'
      property: string
      metric: AggregationType
      valueKind?: 'domain' | 'source' | 'country' | BrandValueKind
    }
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

const buildTabQuery = (
  navEvent: string,
  tab: BreakdownTab,
  filters: readonly ActiveFilter[],
  propertyMetric?: AggregationType,
) => {
  if (tab.source === 'property') {
    return buildTopKBreakdownQuery(navEvent, tab.property, propertyMetric ?? tab.metric, filters)
  }
  if (tab.source === 'eventKind') return buildEventKindTopKQuery(filters)
  return buildSessionBreakdownQuery(navEvent, tab.metric, tab.property, filters)
}

// Labels come from the stat row's table so a mobile project reads "Users / Screen views" here too.
const propertyMetrics = (kind: NavEvent['kind']) =>
  [
    { metric: AggregationType.UNIQUE_USERS, label: getTrafficStat('users').label[kind] },
    { metric: AggregationType.TOTAL, label: getTrafficStat('pageviews').label[kind] },
  ] as const

type MetricOption = ReturnType<typeof propertyMetrics>[number]

// The column header names what the column measures, so it swaps in place instead of opening a menu
// over the rows it re-ranks. `uppercase` is explicit: a <button> doesn't inherit text-transform, so
// without it this is the one header cell rendering in sentence case.
const MetricToggle = ({
  value,
  options,
  onChange,
}: {
  value: AggregationType
  options: readonly MetricOption[]
  onChange: (metric: AggregationType) => void
}) => {
  const index = Math.max(
    options.findIndex(option => option.metric === value),
    0,
  )
  const next = options[(index + 1) % options.length]
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => onChange(next.metric)}
            // Negative margins keep the label flush with the numbers below and the row height steady
            // across tabs, while the hover pill still reads as a control.
            className="-my-0.5 -mr-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <ArrowLeftRight className="size-3 opacity-70" />
            {options[index].label}
          </button>
        }
      />
      <TooltipContent className="text-xs">Show {next.label.toLowerCase()}</TooltipContent>
    </Tooltip>
  )
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
          'rounded px-1.5 py-0.5 text-xs transition-colors',
          tab.id === activeId ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {tab.label}
      </button>
    ))}
  </div>
)

// Fixed-width box so labels stay aligned whether or not a row resolves a glyph.
const GlyphSlot = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <span className={cn('inline-flex w-4 shrink-0 items-center justify-center', className)}>{children}</span>
)

export const TrafficBreakdownPanel = ({
  config,
  nav,
  range,
  granularity,
  queryKeyPrefix,
  filters,
  onAddFilter,
  onEventClick,
}: {
  config: BreakdownPanelConfig
  nav: NavEvent
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

  // Property tabs remember their own visitor/pageview choice (keyed by tab id); session and event-kind
  // tabs have a fixed metric, so the override never applies to them.
  const [metricByTab, setMetricByTab] = useState<Record<string, AggregationType>>({})
  const propertyMetric = tab.source === 'property' ? (metricByTab[tab.id] ?? tab.metric) : undefined

  // Apply page filters except this panel's own dimension, so every value of it stays visible and
  // togglable while the rest of the filter set still narrows the list.
  const queryFilters = useMemo(() => filtersExcept(filters, selfProperty), [filters, selfProperty])
  const baseQuery = useMemo(
    () => buildTabQuery(nav.name, tab, queryFilters, propertyMetric),
    [nav, tab, queryFilters, propertyMetric],
  )
  const { result, error, retry } = useTrafficQuery(baseQuery, range, granularity, `${queryKeyPrefix}-${tab.id}`)

  // useDebouncedQuery keeps the previous `data` across a key change, so `result` alone can't say what
  // produced it. Pin it to what the column *means* — panel, tab and metric, but not the filters, so a
  // same-shape refetch keeps its rows and filtering doesn't flicker. Not `loading`: that's set in an
  // effect, so it still reads false on the render the switch happens on.
  const shape = `${nav.name}:${config.title}:${tab.id}:${propertyMetric ?? ''}`
  const [seen, setSeen] = useState({ result, shape })
  if (seen.result !== result) setSeen({ result, shape })

  const rows = useMemo<RankedRow[]>(() => {
    if (tab.source === 'session') {
      return result.case === 'trends' ? rankSessionBreakdown(result.value.series, SESSION_BREAKDOWN_LIMIT) : []
    }
    return result.case === 'topK' ? topKToRankedRows(result.value.rows) : []
  }, [tab.source, result])

  // Rows answering a question this column is no longer asking, or nothing fetched yet: showing them
  // would read as this column's data, and an empty list would claim "No data" over a live query.
  const pending = seen.shape !== shape || result.case === undefined

  // Property rows cross-filter the view; event-kind rows drill through (no filter, so no active state).
  let onRowClick: ((row: RankedRow) => void) | undefined
  if (selfProperty) onRowClick = row => onAddFilter(selfProperty, row.label)
  else if (tab.source === 'eventKind' && onEventClick) onRowClick = row => onEventClick(row.label)
  const isActive = selfProperty ? (row: RankedRow) => hasFilter(filters, selfProperty, row.label) : undefined

  // A `valueKind`-tagged tab leads each row with a glyph and, for countries, a friendlier label; the
  // raw value stays the filter/query key. Muted buckets and unresolved values fall back to a spacer.
  const valueKind = tab.source === 'property' ? tab.valueKind : undefined
  let renderLeading: ((row: RankedRow) => ReactNode) | undefined
  let formatLabel: ((row: RankedRow) => string) | undefined
  if (valueKind === 'domain' || valueKind === 'source') {
    const toDomain = valueKind === 'source' ? utmSourceDomain : (value: string) => value
    renderLeading = row => {
      const domain = row.muted ? undefined : toDomain(row.label)
      return domain ? <DomainFavicon domain={domain} /> : <span className="size-4 shrink-0" />
    }
  } else if (valueKind === 'country') {
    // $country is an ISO alpha-2 code: flag from the code, name for the label. Flags are 4:3, so they
    // need a wider slot than the square glyphs to carry the same optical weight.
    renderLeading = row => (
      <GlyphSlot className="w-5">{row.muted ? null : <CountryFlag code={row.label} size={20} />}</GlyphSlot>
    )
    formatLabel = row => (row.muted ? row.label : formatCountryName(row.label))
  } else if (valueKind === 'browser' || valueKind === 'os' || valueKind === 'device') {
    const resolve = BRAND_ICON_RESOLVERS[valueKind]
    const unknownGlyph = valueKind === 'browser' ? <UnknownBrowserIcon size={16} /> : null
    renderLeading = row => (
      <GlyphSlot>
        {row.muted ? null : <BrandIcon name={resolve(row.label)} size={16} unknownGlyph={unknownGlyph} />}
      </GlyphSlot>
    )
    // Ingest only fills an auto-property that's absent, so the mobile SDKs' own lowercase $os
    // ("ios", "android") reaches us unnormalized while the UA parser's is title-cased.
    if (valueKind === 'os') formatLabel = row => (row.muted ? row.label : (OS_LABELS[row.label] ?? row.label))
  }

  let metricControl: ReactNode = 'Count'
  if (tab.source === 'property') {
    metricControl = (
      <MetricToggle
        value={propertyMetric ?? tab.metric}
        options={propertyMetrics(nav.kind)}
        onChange={metric => setMetricByTab(prev => ({ ...prev, [tab.id]: metric }))}
      />
    )
  } else if (tab.source === 'session') {
    metricControl = 'Sessions'
  }

  return (
    <OverviewTileShell
      title={config.title}
      footer={config.footer}
      // min-h, not fixed h: stretches to the row when the taller map shares it.
      className="min-h-[420px]"
      meta={config.tabs.length > 1 ? <TabStrip tabs={config.tabs} activeId={tab.id} onSelect={setActiveId} /> : null}
    >
      {/* absolute so the list scrolls at the tile's height instead of the rows setting it */}
      <div className="absolute inset-0">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : pending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground/70" />
          </div>
        ) : (
          <TrafficRankedList
            rows={rows}
            showShare={isTopK}
            onRowClick={onRowClick}
            isActive={isActive}
            renderLeading={renderLeading}
            formatLabel={formatLabel}
            dimensionLabel={tab.label}
            metricControl={metricControl}
          />
        )}
      </div>
    </OverviewTileShell>
  )
}
