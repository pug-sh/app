import { Clock, Edit3, MoreHorizontal, Trash2 } from 'lucide-react'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { INSIGHTS_PRESETS } from '@/lib/date-presets'
import { granularityDisabledReason } from '@/lib/granularity'
import { OptionChip } from '../../insights/controls'
import { UNTITLED_DASHBOARD_NAME } from '../constants'
import type { DashboardMetaPatch } from '../draft-state'
import { InlineEditableText } from '../editor-shared'
import { GLOBAL_DASHBOARD_GRANULARITIES } from './controls-helpers'
import { ShareControl } from './share-popover'

// Page header: the dashboard title/description (inline-editable in edit mode) plus
// the global time/granularity controls and the edit/delete actions.
export const DashboardHeader = ({
  dashboard,
  editing,
  meta,
  autoFocusName,
  onPatchMeta,
  globalTimeRange,
  globalGranularity,
  onTimeRangeChange,
  onGranularityChange,
  onEdit,
  onRequestDelete,
  deleting,
  shareId,
  sharing,
  onTogglePublic,
}: {
  dashboard: Dashboard
  editing: boolean
  meta: Dashboard | null
  autoFocusName: boolean
  onPatchMeta: (patch: DashboardMetaPatch) => void
  globalTimeRange: TimeRange | undefined
  globalGranularity: Granularity
  onTimeRangeChange: (range: TimeRange | undefined) => void
  onGranularityChange: (granularity: Granularity) => void
  onEdit: () => void
  onRequestDelete: () => void
  deleting: boolean
  shareId: string
  sharing: boolean
  onTogglePublic: (next: boolean) => void
}) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
    <div className="min-w-0 flex-1 space-y-3">
      {editing ? (
        <InlineEditableText
          value={meta?.displayName ?? ''}
          onChange={next => onPatchMeta({ displayName: next })}
          placeholder={UNTITLED_DASHBOARD_NAME}
          autoFocus={autoFocusName}
          className="min-h-12 flex-1 text-3xl font-medium tracking-tight outline-hidden"
        />
      ) : (
        <h1 className="min-h-12 text-3xl font-medium tracking-tight">
          {dashboard.displayName || UNTITLED_DASHBOARD_NAME}
        </h1>
      )}
      {editing ? (
        <InlineEditableText
          value={meta?.description ?? ''}
          onChange={next => onPatchMeta({ description: next })}
          placeholder="Add a short description for what this dashboard tracks"
          multiline
          className="min-h-8 max-w-3xl text-sm text-muted-foreground outline-hidden"
        />
      ) : dashboard.description ? (
        <p className="min-h-8 max-w-3xl text-sm text-muted-foreground">{dashboard.description}</p>
      ) : null}
    </div>
    <div className="shrink-0">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <DateRangePicker
          value={globalTimeRange}
          onChange={onTimeRangeChange}
          presets={INSIGHTS_PRESETS}
          allowUnset
          unsetLabel="Select time"
        />
        <OptionChip
          label="granularity"
          icon={Clock}
          options={GLOBAL_DASHBOARD_GRANULARITIES}
          value={globalGranularity}
          onChange={onGranularityChange}
          isOptionDisabled={v => granularityDisabledReason(v, globalTimeRange)}
        />
        {!editing ? <ShareControl shareId={shareId} sharing={sharing} onTogglePublic={onTogglePublic} /> : null}
        {!editing ? (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Edit3 className="size-3" />
            Edit
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" />}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem variant="destructive" onClick={onRequestDelete} disabled={deleting}>
              <Trash2 className="size-4" />
              Delete dashboard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </div>
)
