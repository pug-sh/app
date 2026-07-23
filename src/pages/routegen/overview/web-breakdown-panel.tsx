import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { AggregationType, type Granularity, type SessionMetric } from '@/api/genproto/shared/insights/v1/insights_pb'
import { CountryFlag } from '@/components/country-flag'
import type { TimeRange } from '@/components/date-range-picker'
import { Devicon } from '@/components/devicon'
import { DomainFavicon } from '@/components/domain-favicon'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { type DeviconName, resolveBrowserDevicon, resolveDeviceModelDevicon, resolveOsDevicon } from '@/lib/devicon-map'
import { formatCountryName } from '@/lib/location'
import { cn } from '@/lib/utils'
import { OverviewTileShell } from './overview-tile-shell'
import { useWebQuery } from './use-web-query'
import { utmSourceDomain } from './utm-source-domains'
import { buildEventKindTopKQuery, buildSessionBreakdownQuery, buildTopKBreakdownQuery } from './web-analytics-queries'
import { type RankedRow, rankSessionBreakdown, topKToRankedRows } from './web-breakdown'
import { filtersExcept, hasFilter } from './web-filters'
import { WebRankedList } from './web-ranked-list'

const SESSION_BREAKDOWN_LIMIT = 50

// Brand-icon resolver per device dimension: a $browser / $os / $device value → a devicon name, or null
// when the brand isn't recognized. $device ranks raw UA models ("Pixel 8", "Mac") with no OS column to
// lean on, so it classifies the model string directly (see resolveDeviceModelDevicon).
const DEVICON_RESOLVERS: Record<'browser' | 'os' | 'device', (value?: string) => DeviconName | null> = {
  browser: resolveBrowserDevicon,
  os: resolveOsDevicon,
  device: resolveDeviceModelDevicon,
}

// A tab is one ranked view within a panel: `property` ranks an auto-property via top-K, `eventKind`
// ranks event kinds, `session` ranks entry/exit pages. Plain data (no closures) so a panel's tab list
// stays a module constant. `valueKind` picks the leading glyph its values render with (see
// renderLeading in the panel below).
export type BreakdownTab = { id: string; label: string } & (
  | {
      source: 'property'
      property: string
      metric: AggregationType
      valueKind?: 'domain' | 'source' | 'country' | 'browser' | 'os' | 'device'
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

const buildTabQuery = (tab: BreakdownTab, filters: readonly ActiveFilter[], propertyMetric?: AggregationType) => {
  if (tab.source === 'property') return buildTopKBreakdownQuery(tab.property, propertyMetric ?? tab.metric, filters)
  if (tab.source === 'eventKind') return buildEventKindTopKQuery(filters)
  return buildSessionBreakdownQuery(tab.metric, tab.property, filters)
}

// Property breakdowns can be ranked by unique visitors or raw pageviews; the picker in each panel's
// column header switches between them. Session (Entry/Exit) and event-kind tabs have a fixed metric.
const PROPERTY_METRICS = [
  { metric: AggregationType.UNIQUE_USERS, label: 'Visitors' },
  { metric: AggregationType.TOTAL, label: 'Views' },
] as const

const metricLabel = (metric: AggregationType) =>
  PROPERTY_METRICS.find(option => option.metric === metric)?.label ?? 'Value'

// Compact metric picker rendered in a breakdown column header, inheriting the header's uppercase muted
// styling. Two options, so a flat single-level popover (per the no-nested-menus design direction).
const MetricSelect = ({ value, onChange }: { value: AggregationType; onChange: (metric: AggregationType) => void }) => {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex items-center gap-0.5 rounded-sm transition-colors hover:text-foreground">
        {metricLabel(value)}
        <ChevronDown className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-36 p-1">
        {PROPERTY_METRICS.map(option => (
          <button
            key={option.metric}
            type="button"
            onClick={() => {
              onChange(option.metric)
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-muted/60',
              option.metric === value ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {option.label}
            {option.metric === value && <Check className="size-3.5" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
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

  // Property tabs remember their own visitor/pageview choice (keyed by tab id); session and event-kind
  // tabs have a fixed metric, so the override never applies to them.
  const [metricByTab, setMetricByTab] = useState<Record<string, AggregationType>>({})
  const propertyMetric = tab.source === 'property' ? (metricByTab[tab.id] ?? tab.metric) : undefined

  // Apply page filters except this panel's own dimension, so every value of it stays visible and
  // togglable while the rest of the filter set still narrows the list.
  const queryFilters = useMemo(() => filtersExcept(filters, selfProperty), [filters, selfProperty])
  const baseQuery = useMemo(() => buildTabQuery(tab, queryFilters, propertyMetric), [tab, queryFilters, propertyMetric])
  const { result, error, retry } = useWebQuery(baseQuery, range, granularity, `${queryKeyPrefix}-${tab.id}`)

  // useDebouncedQuery keeps the previous `data` across a key change, and a panel's `property` tabs all
  // share a `source`, so `result` alone can't say which tab produced it. Pin each result to the tab
  // that was active when it landed. Not `loading`: that's set in an effect, so it still reads false on
  // the render the switch happens on — long enough to paint the old tab's rows under the new one.
  const [seen, setSeen] = useState({ result, tab: tab.id })
  if (seen.result !== result) setSeen({ result, tab: tab.id })

  const rows = useMemo<RankedRow[]>(() => {
    if (tab.source === 'session') {
      return result.case === 'trends' ? rankSessionBreakdown(result.value.series, SESSION_BREAKDOWN_LIMIT) : []
    }
    return result.case === 'topK' ? topKToRankedRows(result.value.rows) : []
  }, [tab.source, result])

  // Rows belonging to the tab we just left, or nothing fetched yet. Either way this tab has no answer
  // to show: the old rows would read as its data, and an empty list would claim "No data" over a live
  // query. A same-tab refetch keeps its rows (result survives), so filtering doesn't flicker.
  const pending = seen.tab !== tab.id || result.case === undefined

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
    // $browser / $os / $device values are already display names; just lead with the brand devicon.
    const resolve = DEVICON_RESOLVERS[valueKind]
    renderLeading = row => {
      const icon = row.muted ? null : resolve(row.label)
      return <GlyphSlot>{icon ? <Devicon name={icon} size={16} /> : null}</GlyphSlot>
    }
  }

  // The value column's header: a visitor/pageview picker for property tabs, a static label otherwise.
  let metricControl: ReactNode = 'Count'
  if (tab.source === 'property') {
    metricControl = (
      <MetricSelect
        value={propertyMetric ?? tab.metric}
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
          <WebRankedList
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
