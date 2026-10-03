import { Loader2, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { DomainStatus, DomainVerificationMethod, type OrgDomain } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import CopyableCode from '@/components/copyable-code'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

export const DomainRow = ({
  domain,
  verifying,
  confirmingRemove,
  removing,
  onVerify,
  onConfirmRemove,
  onRemove,
  onCancelRemove,
  updatingSSO,
  onRequireSSO,
}: {
  domain: OrgDomain
  verifying: boolean
  confirmingRemove: boolean
  removing: boolean
  onVerify: () => void
  onConfirmRemove: () => void
  onRemove: () => void
  onCancelRemove: () => void
  updatingSSO: boolean
  onRequireSSO: (on: boolean) => void
}) => {
  const verified = domain.status === DomainStatus.VERIFIED
  const byOperator = domain.verificationMethod === DomainVerificationMethod.OPERATOR

  let removeControl: ReactNode
  if (removing) {
    removeControl = <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
  } else if (confirmingRemove) {
    removeControl = (
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-xs font-medium text-negative underline-offset-2 hover:underline"
      >
        Remove?
      </button>
    )
  } else {
    removeControl = (
      <button
        type="button"
        onClick={onConfirmRemove}
        aria-label={`Remove ${domain.domain}`}
        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-negative group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    )
  }

  let recordHint =
    'Add this TXT record at your DNS provider, and keep it there. DNS changes can take a few minutes to show up.'
  if (verified) recordHint = 'Keep this TXT record at your DNS provider.'

  return (
    <div className="group border-b border-border/50 py-3" onMouseLeave={onCancelRemove}>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{domain.domain}</span>
        {verified ? (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {byOperator ? 'Verified by your administrator' : 'Verified'}
          </Badge>
        ) : (
          <>
            <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
              Pending
            </Badge>
            <Button variant="outline" size="sm" className="shrink-0" onClick={onVerify} disabled={verifying}>
              {verifying && <Loader2 className="animate-spin" />}
              Verify now
            </Button>
          </>
        )}
        {removeControl}
      </div>
      {/* The operator's word needs no record; a DNS one is re-checked whenever a setting grants or restricts more. */}
      {!byOperator && (
        <div className="mt-2 pl-4">
          <p className="mb-1 text-xs text-muted-foreground">{recordHint}</p>
          <CopyableCode label="TXT name" value={domain.txtRecordName} />
          <CopyableCode label="TXT value" value={domain.txtRecordValue} />
        </div>
      )}
      {verified && (
        <div className="mt-2 flex items-start justify-between gap-6 pl-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Require SSO</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {domain.domain} accounts must sign in through SSO. Passwords and email links stop working for them. People
              signed in another way are signed out within a day. So are SSO sessions started before Require SSO was
              available.
            </p>
            {/* It has no admin exception, so before anyone has signed in through SSO it could lock everyone out. */}
            {!domain.requireSso && !domain.ssoSeen && (
              <p className="mt-1 text-xs text-muted-foreground">
                Sign in once through SSO with an account on {domain.domain} to turn this on.
              </p>
            )}
            {domain.ssoRequiredElsewhere && (
              <p className="mt-1 text-xs text-muted-foreground">
                Also required by another organization that verified {domain.domain}.
              </p>
            )}
          </div>
          <Switch
            className="mt-0.5 shrink-0"
            checked={domain.requireSso}
            disabled={updatingSSO || (!domain.requireSso && !domain.ssoSeen)}
            aria-label={`Require SSO for ${domain.domain}`}
            onCheckedChange={onRequireSSO}
          />
        </div>
      )}
    </div>
  )
}
