import type { Timestamp } from '@bufbuild/protobuf/wkt'
import { ArrowRight, Globe, PanelsTopLeft, Trash2 } from 'lucide-react'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Can } from '@/auth/can'
import HoverSwap from '@/components/hover-swap'
import ProjectLink from '@/components/project-link'
import { Badge } from '@/components/ui/badge'
import { formatRelative } from '@/hooks/use-relative-time'
import { tsToDate } from '@/lib/timestamp'
import { UNTITLED_DASHBOARD_NAME } from './constants'
import { DashboardDeleteConfirmation } from './delete-confirmation'

// 2-digit day keeps the absolute string a constant width so the hover-swap and
// the meta grid columns line up across rows.
const formatDashboardTime = (date: Date) =>
  date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

const formatTileCount = (count: number) => `${count} ${count === 1 ? 'tile' : 'tiles'}`

// Relative time by default, absolute on hover (per the time-display convention).
const TimeStat = ({ label, ts }: { label: string; ts: Timestamp | undefined }) => {
  const date = tsToDate(ts)
  if (!date) return null
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums md:justify-end">
      <span>{label}</span>
      <HoverSwap primary={formatRelative(date)} secondary={formatDashboardTime(date)} />
    </span>
  )
}

type DashboardListRowProps = {
  dashboard: Dashboard
  pendingDelete: boolean
  deleting: boolean
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onOpenEmpty: () => void
}

export const DashboardListRow = ({
  dashboard,
  pendingDelete,
  deleting,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onOpenEmpty,
}: DashboardListRowProps) => {
  if (pendingDelete) {
    return (
      <div className="py-2">
        <DashboardDeleteConfirmation
          target={{ type: 'dashboard', dashboardId: dashboard.id, displayName: dashboard.displayName }}
          deleting={deleting}
          onCancel={onCancelDelete}
          onConfirm={onConfirmDelete}
        />
      </div>
    )
  }

  const createdAt = tsToDate(dashboard.createTime)
  const updatedAt = tsToDate(dashboard.updateTime)
  // Hide the redundant "Created" when it matches "Updated" (never edited).
  const showCreated = createdAt && (!updatedAt || createdAt.getTime() !== updatedAt.getTime())

  return (
    <ProjectLink
      href={`/dashboards/${dashboard.id}`}
      onClick={() => {
        // An empty dashboard has nothing to view — open it straight in edit mode.
        if (dashboard.tiles.length === 0) onOpenEmpty()
      }}
      className="group -mx-2 grid gap-3 rounded-lg px-2 py-4 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition-colors group-hover:bg-muted">
          <PanelsTopLeft className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {dashboard.displayName || UNTITLED_DASHBOARD_NAME}
            </p>
            {dashboard.shareId ? (
              <Badge variant="secondary" className="shrink-0">
                <Globe />
                Public
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl truncate text-xs text-muted-foreground">
            {dashboard.description || 'No description yet'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground md:grid md:grid-cols-[auto_auto_auto] md:items-center md:gap-x-8 lg:grid-cols-[auto_auto_auto_auto]">
        <span className="font-mono tabular-nums md:text-right">{formatTileCount(dashboard.tiles.length)}</span>
        <TimeStat label="Updated" ts={dashboard.updateTime} />
        <span className="hidden lg:block">
          {showCreated ? <TimeStat label="Created" ts={dashboard.createTime} /> : null}
        </span>
        <span className="flex items-center justify-end gap-1">
          <Can action="delete" resource="dashboard">
            <button
              type="button"
              aria-label="Delete dashboard"
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                onRequestDelete()
              }}
              className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-negative group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </Can>
          <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </div>
    </ProjectLink>
  )
}
