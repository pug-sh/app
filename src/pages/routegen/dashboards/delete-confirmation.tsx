import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type DashboardDeleteTarget = { type: 'dashboard'; dashboardId: string; displayName: string }

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
  <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
    <p className="min-w-0 text-sm">
      <span className="font-medium">Delete {target.displayName || 'dashboard'}?</span>{' '}
      <span className="text-muted-foreground">This cannot be undone.</span>
    </p>
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>
        Cancel
      </Button>
      <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting}>
        {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        Delete
      </Button>
    </div>
  </div>
)
