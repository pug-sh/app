import { create } from '@bufbuild/protobuf'
import { Copy, MoreHorizontal, Share, TrendingUp } from 'lucide-react'
import { type ReactNode, type RefObject, useMemo, useRef } from 'react'
import snarkdown from 'snarkdown'
import { type DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { type Granularity, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { ShareChartButton } from '@/components/share-chart-button'
import { TwemojiIcon } from '@/components/twemoji-icon'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { fmtDateRange, resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { accentStripClass } from './accent-palette'
import { applyDashboardFilters, dashboardFilterOverlap } from './dashboard-filters'
import { FilterOverlapFlag, filteredEmptyQualifier } from './filter-overlap-flag'
import { DashboardInsightContent } from './insight-tile-content'
import { getProtoRange } from './query'
import { TileHeaderEdit } from './tile-header-edit'

// `$` too: snarkdown inserts link URLs with String.replace, where it starts a replacement pattern.
const escapeMarkdownHTML = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('$', '&#36;')

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:'])

const isSafeURL = (url: string) => {
  try {
    return SAFE_PROTOCOLS.has(new URL(url, document.baseURI).protocol)
  } catch {
    return false
  }
}

// snarkdown doesn't sanitize URLs. Checked on the parsed DOM, so text that imitates an attribute can't hide one.
const sanitizeMarkdownHTML = (markup: string) => {
  const doc = new DOMParser().parseFromString(markup, 'text/html')
  for (const el of doc.querySelectorAll('[href], [src]')) {
    for (const name of ['href', 'src']) {
      const url = el.getAttribute(name)
      if (url !== null && !isSafeURL(url)) el.removeAttribute(name)
    }
  }
  return doc.body.innerHTML
}

export const renderMarkdownTileHTML = (body: string) => sanitizeMarkdownHTML(snarkdown(escapeMarkdownHTML(body)))

const NO_FILTERS: readonly ActiveFilter[] = []

type TileContentProps = {
  tile: DashboardTile
  editing?: boolean
  onPatch?: (patch: Partial<DashboardTile>) => void
}

export const TileShell = ({
  tile,
  editing,
  onPatch,
  children,
  bodyRef,
  flag,
}: TileContentProps & { children: ReactNode; bodyRef?: RefObject<HTMLDivElement | null>; flag?: ReactNode }) => {
  const hideTitle = tile.header?.hideTitle === true
  const accent = tile.header?.accentColor ?? ''
  const icon = tile.header?.icon ?? ''
  const borderless = tile.header?.borderless === true
  const isKpi = tile.viewMode === DashboardTileViewMode.KPI

  let header: ReactNode = null
  if (editing && onPatch) {
    // Edit mode keeps the grip so the tile stays draggable. When the title is
    // hidden in view mode, collapse to just the grip so the editor reflects
    // that state; renaming stays available from the config panel header.
    header = <TileHeaderEdit tile={tile} onPatch={onPatch} hideTitle={hideTitle} flag={flag} />
  } else if (!hideTitle) {
    header = (
      <div className={`flex min-w-0 shrink-0 items-start gap-2 pr-8 ${isKpi ? 'mb-1' : 'mb-3'}`}>
        {icon ? <TwemojiIcon emoji={icon} size={16} className="mt-0.5" /> : null}
        <div className="min-w-0 flex-1">
          <h3 className={isKpi ? 'truncate text-sm font-normal text-muted-foreground' : 'truncate text-base'}>
            {tile.displayName}
          </h3>
          {tile.description ? <p className="mt-1 text-xs text-muted-foreground">{tile.description}</p> : null}
        </div>
        {flag}
      </div>
    )
  } else if (flag) {
    // Clear of the share and tile-menu buttons at right-4.
    header = <div className="absolute top-4 right-12 z-10">{flag}</div>
  }

  return (
    <div
      className={[
        'group relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg p-4',
        borderless ? '' : 'border border-border/60 bg-card',
      ].join(' ')}
    >
      {accent ? (
        <div className={`absolute top-0 left-0 h-full w-[3px] ${accentStripClass(accent)}`} aria-hidden />
      ) : null}
      {header}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden pt-0.5">
        {children}
      </div>
    </div>
  )
}

export const DashboardMarkdownTile = ({ tile, editing, onPatch }: TileContentProps) => {
  if (tile.content.case !== 'markdown') return null

  const html = renderMarkdownTileHTML(tile.content.value.body)

  return (
    <TileShell tile={tile} editing={editing} onPatch={onPatch}>
      <div
        className="markdown-body h-full overflow-auto pr-1 text-sm leading-6 text-foreground"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </TileShell>
  )
}

const DashboardInsightTile = ({
  tile,
  editing,
  onPatch,
  globalTimeRange,
  globalGranularity,
  globalFilters,
  bodyRef,
}: TileContentProps & {
  globalTimeRange?: TimeRange
  globalGranularity?: Granularity
  globalFilters?: readonly ActiveFilter[]
  bodyRef?: RefObject<HTMLDivElement | null>
}) => {
  const filters = globalFilters ?? NO_FILTERS
  const savedSpec = tile.content.case === 'insight' ? tile.content.value.spec : undefined
  const query = useMemo(() => {
    const spec = applyDashboardFilters(savedSpec, filters)
    return spec ? create(QueryRequestSchema, { spec }) : undefined
  }, [savedSpec, filters])
  const overlap = dashboardFilterOverlap(savedSpec, filters)
  const flagged = overlap.filters.length > 0 || overlap.splits.length > 0

  return (
    <TileShell
      tile={tile}
      editing={editing}
      onPatch={onPatch}
      bodyRef={bodyRef}
      flag={flagged ? <FilterOverlapFlag overlap={overlap} /> : null}
    >
      <DashboardInsightContent
        tile={tile}
        query={query}
        defaultTimeRange={undefined}
        timeRangeOverride={globalTimeRange}
        granularityOverride={globalGranularity}
        queryKeyPrefix={tile.id}
        emptyQualifier={filteredEmptyQualifier(overlap, filters.length > 0)}
        compact
      />
    </TileShell>
  )
}

// Build the "May 13 – Jun 12" time-range label shown in the shared card's corner,
// mirroring how the insight content resolves its effective range: the global
// override wins, else the tile's embedded spec, else defaults. Marked Filtered
// while dashboard filters apply.
const formatTileMeta = (tile: DashboardTile, globalTimeRange?: TimeRange, filtered = false) => {
  if (tile.content.case !== 'insight') return ''
  const query = create(QueryRequestSchema, { spec: tile.content.value.spec })
  const range = globalTimeRange ?? resolveDashboardTimeRangePreset(undefined, getProtoRange(query.timeRange))
  return filtered ? `${fmtDateRange(range)} · Filtered` : fmtDateRange(range)
}

export const DashboardTileBody = ({
  tile,
  editing,
  onPatch,
  onDuplicate,
  globalTimeRange,
  globalGranularity,
  globalFilters,
}: {
  tile: DashboardTile
  editing?: boolean
  onPatch?: (patch: Partial<DashboardTile>) => void
  onDuplicate?: (tile: DashboardTile) => void
  globalTimeRange?: TimeRange
  globalGranularity?: Granularity
  globalFilters?: readonly ActiveFilter[]
}) => {
  // Points at just the chart region so the share button snapshots the chart as-is,
  // then draws its own card chrome (editable title + time range) around it.
  const chartRef = useRef<HTMLDivElement>(null)
  const canShare = !editing && tile.content.case === 'insight'

  return (
    <div className="group relative h-full min-h-0">
      <div className="h-full min-h-0">
        {tile.content.case === 'markdown' ? (
          <DashboardMarkdownTile tile={tile} editing={editing} onPatch={onPatch} />
        ) : (
          <DashboardInsightTile
            tile={tile}
            editing={editing}
            onPatch={onPatch}
            globalTimeRange={globalTimeRange}
            globalGranularity={globalGranularity}
            globalFilters={globalFilters}
            bodyRef={chartRef}
          />
        )}
      </div>
      {canShare ? (
        <ShareChartButton
          targetRef={chartRef}
          defaultTitle={tile.displayName}
          meta={formatTileMeta(tile, globalTimeRange, (globalFilters?.length ?? 0) > 0)}
          fallbackName={`chart-${tile.id}`}
          trigger={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Share chart"
              title="Share chart"
              data-no-drag="true"
              onMouseDown={event => event.stopPropagation()}
              className="absolute top-4 right-4 z-20 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100"
            >
              <Share className="size-4" />
            </Button>
          }
        />
      ) : null}
      {onDuplicate ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-4 right-4 z-20 opacity-0 transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100"
                onMouseDown={event => event.stopPropagation()}
              />
            }
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem onClick={() => onDuplicate(tile)}>
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

export const DashboardEmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <TrendingUp className="mb-4 h-10 w-10 opacity-15" />
    <p className="mb-1 text-sm font-medium">{title}</p>
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
)
