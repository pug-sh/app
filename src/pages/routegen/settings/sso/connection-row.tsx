import { Pencil } from 'lucide-react'
import type { SSOConnection } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { connectionRedirectURI } from '@/auth/oidc'
import CopyableCode from '@/components/copyable-code'
import StatusLabel from '@/components/status-label'
import { RemoveControl } from './domain-row'

export const ConnectionRow = ({
  connection,
  confirmingRemove,
  removing,
  onEdit,
  onConfirmRemove,
  onRemove,
  onCancelRemove,
}: {
  connection: SSOConnection
  confirmingRemove: boolean
  removing: boolean
  onEdit: () => void
  onConfirmRemove: () => void
  onRemove: () => void
  onCancelRemove: () => void
}) => {
  const domains = connection.domains.map(d => d.domain).join(', ')

  return (
    <div className="group border-b border-border/50 py-3" onMouseLeave={onCancelRemove}>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{connection.label}</span>
        <button
          type="button"
          onClick={onEdit}
          disabled={removing}
          aria-label={`Edit ${connection.label}`}
          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
        <RemoveControl
          name={connection.label}
          confirming={confirmingRemove}
          removing={removing}
          onConfirm={onConfirmRemove}
          onRemove={onRemove}
        />
        {connection.domains.length === 0 && <StatusLabel tone="caution">No domains</StatusLabel>}
      </div>
      <div className="mt-2 pl-4">
        {connection.domains.length > 0 && <p className="text-xs text-muted-foreground">{`Signs in ${domains}`}</p>}
        <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{connection.issuerUrl}</p>
        <p className="mt-2 mb-1 text-xs text-muted-foreground">Add this redirect URL in your identity provider.</p>
        <CopyableCode label="Redirect URL" value={connectionRedirectURI(connection.id)} />
      </div>
    </div>
  )
}
