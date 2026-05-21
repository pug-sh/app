import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type DashboardDeleteTarget =
  | { type: 'tile'; tileId: string; displayName: string }
  | { type: 'dashboard'; dashboardId: string; displayName: string }

export const DashboardDeleteConfirmation = ({
  target,
  deleting,
  onCancel,
  onConfirm,
}: {
  target: DashboardDeleteTarget
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) => (
  <div className="flex flex-col gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <p className="font-medium">
        Delete {target.type === 'dashboard' ? 'dashboard' : 'tile'} "{target.displayName}"?
      </p>
      <p className="text-xs text-muted-foreground">This cannot be undone.</p>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="outline" size="sm" onClick={onCancel} disabled={deleting}>
        Cancel
      </Button>
      <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting}>
        {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        Delete
      </Button>
    </div>
  </div>
)
