import { Edit3, MoreHorizontal, Trash2, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import snarkdown from 'snarkdown'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { getDashboardTimeRangePresetLabel } from '@/lib/date-presets'
import { DashboardInsightContent } from './insight-tile-content'

const escapeMarkdownHTML = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const DANGEROUS_URL_SCHEME = /^\s*(?:javascript|data|vbscript):/i

// snarkdown does not sanitize link/image URLs, so neutralize dangerous schemes in the
// generated markup before it is rendered.
const sanitizeMarkdownHTML = (markup: string) =>
  markup.replace(/(\b(?:href|src)=)(["'])(.*?)\2/gi, (match, attr, quote, url) =>
    DANGEROUS_URL_SCHEME.test(url) ? `${attr}${quote}#${quote}` : match,
  )

const TileShell = ({
  tile,
  timeRangeLabel,
  children,
}: {
  tile: DashboardTile
  timeRangeLabel?: string
  children: ReactNode
}) => {
  return (
    <div className="group flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background p-4">
      <div className="mb-3 flex min-w-0 shrink-0 items-start gap-3 pr-8">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{tile.displayName}</h3>
          {tile.description ? <p className="mt-1 text-xs text-muted-foreground">{tile.description}</p> : null}
        </div>
        {timeRangeLabel ? (
          <span className="shrink-0 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
            {timeRangeLabel}
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden pt-0.5">{children}</div>
    </div>
  )
}

const DashboardMarkdownTile = ({ tile }: { tile: DashboardTile }) => {
  if (tile.content.case !== 'markdown') return null

  const html = sanitizeMarkdownHTML(snarkdown(escapeMarkdownHTML(tile.content.value.body)))

  return (
    <TileShell tile={tile}>
      <div
        className="markdown-body h-full overflow-auto pr-1 text-sm leading-6 text-foreground"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </TileShell>
  )
}

const DashboardInsightTile = ({
  tile,
  globalTimeRange,
  globalGranularity,
}: {
  tile: DashboardTile
  globalTimeRange?: TimeRange
  globalGranularity?: Granularity
}) => {
  const query = tile.content.case === 'insight' ? tile.content.value.query : undefined
  const timeRangeLabel = globalTimeRange ? undefined : getDashboardTimeRangePresetLabel(tile.defaultTimeRange)

  return (
    <TileShell tile={tile} timeRangeLabel={timeRangeLabel}>
      <DashboardInsightContent
        query={query}
        defaultTimeRange={tile.defaultTimeRange}
        timeRangeOverride={globalTimeRange}
        granularityOverride={globalGranularity}
        viewMode={tile.viewMode}
        queryKeyPrefix={tile.id}
        compact
      />
    </TileShell>
  )
}

export const DashboardTileBody = ({
  tile,
  onEdit,
  onDelete,
  globalTimeRange,
  globalGranularity,
}: {
  tile: DashboardTile
  onEdit?: (tile: DashboardTile) => void
  onDelete?: (tile: DashboardTile) => void
  globalTimeRange?: TimeRange
  globalGranularity?: Granularity
}) => (
  <div className="group relative h-full min-h-0">
    <div className="h-full min-h-0">
      {tile.content.case === 'markdown' ? (
        <DashboardMarkdownTile tile={tile} />
      ) : (
        <DashboardInsightTile tile={tile} globalTimeRange={globalTimeRange} globalGranularity={globalGranularity} />
      )}
    </div>
    {onEdit || onDelete ? (
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
          {onEdit ? (
            <DropdownMenuItem onClick={() => onEdit(tile)}>
              <Edit3 className="size-4" />
              Edit
            </DropdownMenuItem>
          ) : null}
          {onDelete ? (
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(tile)}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          ) : null}
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
