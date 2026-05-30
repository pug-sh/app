import { create } from '@bufbuild/protobuf'
import { Copy, MoreHorizontal, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import snarkdown from 'snarkdown'
import { type DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { type Granularity, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { accentStripClass } from './accent-palette'
import { DashboardInsightContent } from './insight-tile-content'
import { TileHeaderEdit } from './tile-header-edit'

const escapeMarkdownHTML = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const DANGEROUS_URL_SCHEME = /^\s*(?:javascript|data|vbscript):/i

// snarkdown does not sanitize link/image URLs, so neutralize dangerous schemes in the
// generated markup before it is rendered.
const sanitizeMarkdownHTML = (markup: string) =>
  markup.replace(/(\b(?:href|src)=)(["'])(.*?)\2/gi, (match, attr, quote, url) =>
    DANGEROUS_URL_SCHEME.test(url) ? `${attr}${quote}#${quote}` : match,
  )

type TileContentProps = {
  tile: DashboardTile
  editing?: boolean
  onPatch?: (patch: Partial<DashboardTile>) => void
}

const TileShell = ({ tile, editing, onPatch, children }: TileContentProps & { children: ReactNode }) => {
  const hideTitle = tile.header?.hideTitle === true
  const accent = tile.header?.accentColor ?? ''
  const icon = tile.header?.icon ?? ''
  const borderless = tile.header?.borderless === true
  const isKpi = tile.viewMode === DashboardTileViewMode.KPI

  return (
    <div
      className={[
        'group relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg p-4',
        borderless ? '' : 'border border-border/60 bg-background',
      ].join(' ')}
    >
      {accent ? (
        <div className={`absolute top-0 left-0 h-full w-[3px] ${accentStripClass(accent)}`} aria-hidden />
      ) : null}
      {editing && onPatch ? (
        // Edit mode always shows the grip + inline rename, even when the title is
        // hidden in view mode — you still need a way to move and name the tile.
        <TileHeaderEdit tile={tile} onPatch={onPatch} />
      ) : hideTitle ? null : (
        <div className={`flex min-w-0 shrink-0 items-start gap-2 pr-8 ${isKpi ? 'mb-1' : 'mb-3'}`}>
          {icon ? <span className="shrink-0 text-base leading-none">{icon}</span> : null}
          <div className="min-w-0 flex-1">
            <h3
              className={
                isKpi ? 'truncate text-sm font-normal text-muted-foreground' : 'truncate text-sm font-medium'
              }
            >
              {tile.displayName}
            </h3>
            {tile.description ? <p className="mt-1 text-xs text-muted-foreground">{tile.description}</p> : null}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden pt-0.5">{children}</div>
    </div>
  )
}

const DashboardMarkdownTile = ({ tile, editing, onPatch }: TileContentProps) => {
  if (tile.content.case !== 'markdown') return null

  const html = sanitizeMarkdownHTML(snarkdown(escapeMarkdownHTML(tile.content.value.body)))

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
}: TileContentProps & {
  globalTimeRange?: TimeRange
  globalGranularity?: Granularity
}) => {
  const spec = tile.content.case === 'insight' ? tile.content.value.spec : undefined
  const query = spec ? create(QueryRequestSchema, { spec }) : undefined

  return (
    <TileShell tile={tile} editing={editing} onPatch={onPatch}>
      <DashboardInsightContent
        tile={tile}
        query={query}
        defaultTimeRange={undefined}
        timeRangeOverride={globalTimeRange}
        granularityOverride={globalGranularity}
        queryKeyPrefix={tile.id}
        compact
      />
    </TileShell>
  )
}

export const DashboardTileBody = ({
  tile,
  editing,
  onPatch,
  onDuplicate,
  globalTimeRange,
  globalGranularity,
}: {
  tile: DashboardTile
  editing?: boolean
  onPatch?: (patch: Partial<DashboardTile>) => void
  onDuplicate?: (tile: DashboardTile) => void
  globalTimeRange?: TimeRange
  globalGranularity?: Granularity
}) => (
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
        />
      )}
    </div>
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

export const DashboardEmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <TrendingUp className="mb-4 h-10 w-10 opacity-15" />
    <p className="mb-1 text-sm font-medium">{title}</p>
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
)
