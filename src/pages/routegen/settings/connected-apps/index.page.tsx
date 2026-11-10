import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2, Plug, Unplug } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Grant } from '@/api/genproto/dashboard/mcpgrants/v1/mcpgrants_pb'
import HoverSwap from '@/components/hover-swap'
import LoadingSpinner from '@/components/loading-spinner'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/hooks/use-relative-time'
import { toastRPCError } from '@/lib/rpc-error'
import { formatDateTime, tsToDate, validDate } from '@/lib/timestamp'
import { grantsAtom, loadGrantsAtom, revokeGrantAtom } from './grants.atoms'

const When = ({ grant, field }: { grant: Grant; field: 'createTime' | 'lastUsedTime' }) => {
  const date = validDate(tsToDate(grant[field]))
  if (!date) return '—'
  return <HoverSwap primary={formatRelative(date)} secondary={formatDateTime(date)} />
}

const ConnectedApps = () => {
  const result = useAtomValue(grantsAtom)
  const load = useSetAtom(loadGrantsAtom)
  const revoke = useSetAtom(revokeGrantAtom)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const disconnect = async (grant: Grant) => {
    setRevoking(grant.id)
    try {
      await revoke(grant.id)
      setConfirming(null)
    } catch (err) {
      toastRPCError(err, `Couldn't disconnect ${grant.clientHost}`)
    } finally {
      setRevoking(null)
    }
  }

  const body = () => {
    if (!result) return <LoadingSpinner />
    if (result.enabled === null) {
      return (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Couldn't load your connected apps.</p>
          <Button variant="outline" size="sm" onClick={() => load()}>
            Retry
          </Button>
        </div>
      )
    }
    if (!result.enabled) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Plug className="mb-3 size-8 opacity-15" />
          <p className="text-sm text-muted-foreground">This Pug server doesn't let apps connect.</p>
        </div>
      )
    }
    if (result.grants.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Plug className="mb-3 size-8 opacity-15" />
          <p className="text-sm text-muted-foreground">No apps are connected.</p>
        </div>
      )
    }
    return (
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <th className="py-2 pr-4 text-left font-medium">App</th>
            <th className="py-2 pr-4 text-left font-medium">Orgs</th>
            <th className="py-2 pr-4 text-left font-medium">Connected</th>
            <th className="py-2 pr-4 text-left font-medium">Last used</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {result.grants.map(grant => (
            <tr
              key={grant.id}
              className="group border-b border-border/50 transition-colors hover:bg-muted/40"
              onMouseLeave={() => setConfirming(null)}
            >
              <td className="py-2.5 pr-4">
                <div className="text-sm">{grant.clientHost}</div>
                {/* Anyone can write any name into their app's details, so the host names the app. */}
                {grant.clientName && <div className="text-xs text-muted-foreground">{grant.clientName}</div>}
              </td>
              <td className="py-2.5 pr-4 text-sm">
                {grant.orgs.length > 0 ? grant.orgs.map(org => org.displayName).join(', ') : '—'}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">
                <When grant={grant} field="createTime" />
              </td>
              <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">
                <When grant={grant} field="lastUsedTime" />
              </td>
              <td className="py-2.5 text-right">
                {revoking === grant.id ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                ) : confirming === grant.id ? (
                  <button
                    type="button"
                    onClick={() => disconnect(grant)}
                    className="whitespace-nowrap text-xs font-medium text-negative underline-offset-2 hover:underline"
                  >
                    Disconnect?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(grant.id)}
                    aria-label={`Disconnect ${grant.clientHost}`}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-negative focus-visible:opacity-100"
                  >
                    <Unplug className="size-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <section className="max-w-2xl">
      <SectionHeader
        title="Connected apps"
        count={result?.enabled ? result.grants.length : undefined}
        description="Apps you let read your projects and edit dashboards as you, such as Claude or ChatGPT. Each reads every project in the orgs you were in when you connected it. Disconnect one and its next request fails."
      />
      {body()}
    </section>
  )
}

export default ConnectedApps
