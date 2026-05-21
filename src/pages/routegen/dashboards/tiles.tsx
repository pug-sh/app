import { Edit3, MoreHorizontal, Trash2, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DashboardInsightContent } from './insight-tile-content'

const TileShell = ({ tile, children }: { tile: DashboardTile; children: ReactNode }) => {
  return (
    <div className="group flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background p-4">
      <div className="mb-3 min-w-0 shrink-0 pr-8">
        <h3 className="truncate text-sm font-semibold">{tile.displayName}</h3>
        {tile.description ? <p className="mt-1 text-xs text-muted-foreground">{tile.description}</p> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden pt-0.5">{children}</div>
    </div>
  )
}

const DashboardMarkdownTile = ({ tile }: { tile: DashboardTile }) => {
  if (tile.content.case !== 'markdown') return null

  return (
    <TileShell tile={tile}>
      <div className="markdown-body h-full overflow-auto pr-1 text-sm leading-6 text-foreground">
        <ReactMarkdown
          components={{
            h1: props => <h1 className="mb-2 text-lg font-semibold" {...props} />,
            h2: props => <h2 className="mb-2 text-base font-semibold" {...props} />,
            h3: props => <h3 className="mb-2 text-sm font-semibold" {...props} />,
            p: props => <p className="mb-3 last:mb-0" {...props} />,
            ul: props => <ul className="mb-3 list-disc pl-5 last:mb-0" {...props} />,
            ol: props => <ol className="mb-3 list-decimal pl-5 last:mb-0" {...props} />,
            li: props => <li className="mb-1" {...props} />,
            code: props => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...props} />,
            pre: props => <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs" {...props} />,
            a: props => <a className="text-primary hover:underline underline-offset-4" {...props} />,
            blockquote: props => (
              <blockquote className="border-l-2 border-border pl-3 text-muted-foreground" {...props} />
            ),
          }}
        >
          {tile.content.value.body}
        </ReactMarkdown>
      </div>
    </TileShell>
  )
}

const DashboardInsightTile = ({
  tile,
  timeRange,
  granularity,
}: {
  tile: DashboardTile
  timeRange: TimeRange | undefined
  granularity: Granularity
}) => {
  const query = tile.content.case === 'insight' ? tile.content.value.query : undefined

  return (
    <TileShell tile={tile}>
      <DashboardInsightContent
        query={query}
        timeRange={timeRange}
        granularity={granularity}
        queryKeyPrefix={tile.id}
        compact
      />
    </TileShell>
  )
}

export const DashboardTileBody = ({
  tile,
  timeRange,
  granularity,
  onEdit,
  onDelete,
}: {
  tile: DashboardTile
  timeRange: TimeRange | undefined
  granularity: Granularity
  onEdit?: (tile: DashboardTile) => void
  onDelete?: (tile: DashboardTile) => void
}) => (
  <div className="group relative h-full min-h-0">
    <div className="h-full min-h-0">
      {tile.content.case === 'markdown' ? (
        <DashboardMarkdownTile tile={tile} />
      ) : (
        <DashboardInsightTile tile={tile} timeRange={timeRange} granularity={granularity} />
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
