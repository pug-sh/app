import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
}) => {
  const targetLabel = target.type === 'dashboard' ? 'dashboard' : 'tile'

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !deleting) onCancel()
      }}
    >
      <DialogContent showCloseButton={!deleting} className="gap-3 p-4 sm:max-w-[24rem]">
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="truncate">Delete {target.displayName || targetLabel}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting}>
            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
