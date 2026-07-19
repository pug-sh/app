import { useAtomValue } from 'jotai'
import { Check, Copy, ExternalLink, KeyRound, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { trackEvent } from '@/analytics/pug'
import { type ApiKey, ApiKeyKind } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { projectsRPCAtom } from '@/api/rpc'
import { Can } from '@/auth/can'
import CopyableCode from '@/components/copyable-code'
import HoverSwap from '@/components/hover-swap'
import LoadingSpinner from '@/components/loading-spinner'
import SectionHeader from '@/components/section-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useApiKeys } from '@/hooks/use-api-keys'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatRelative } from '@/hooks/use-relative-time'
import { toastRPCError } from '@/lib/rpc-error'
import { formatDateTime, tsToDate } from '@/lib/timestamp'

const AUTH_DOCS_URL = 'https://docs.pug.sh/docs/get-started/authentication'

// Total over ApiKeyKind so a new kind must declare a label (same compile-safety as ROLE_LABEL).
const KIND_LABEL: Record<ApiKeyKind, string> = {
  [ApiKeyKind.UNSPECIFIED]: '',
  [ApiKeyKind.PUBLIC]: 'Public',
  [ApiKeyKind.PRIVATE]: 'Private',
}

// proto3 enums are open: a kind off the wire may not be a declared key (e.g. shipped
// backend-first). Unknown kind → no label, mirroring roleLabel.
const kindLabel = (kind: ApiKeyKind) => KIND_LABEL[kind] ?? ''

// A key's value in the list. A private key has none to copy — only the mask the server rendered at
// creation ("prv_...3f9c"), which is there to tell a project's private keys apart.
const KeyValue = ({ apiKey }: { apiKey: ApiKey }) => {
  const { copied, copy } = useCopyToClipboard()

  if (apiKey.kind !== ApiKeyKind.PUBLIC) {
    return <code className="font-mono text-xs text-muted-foreground">{apiKey.masked}</code>
  }

  return (
    <button
      type="button"
      onClick={() => copy(apiKey.key, 'api_key:public')}
      // The key value is this cell's only content, and an aria-label would replace it as the
      // button's accessible name — leaving a screen reader no way to read the key itself.
      aria-label={`Copy key ${apiKey.key}`}
      className="group/copy inline-flex items-center gap-1.5 text-left font-mono text-xs transition-colors hover:text-foreground"
    >
      <span className="break-all">{apiKey.key}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-green-600 dark:text-green-400" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-100" />
      )}
    </button>
  )
}

// The one and only sighting of a private key. It is unrecoverable once dismissed, so this
// waits for an explicit Done rather than clearing itself on the next render or a timer.
const NewPrivateKey = ({ value, onDismiss }: { value: string; onDismiss: () => void }) => {
  const { copied, copy } = useCopyToClipboard()

  return (
    <div className="mb-4 rounded-md border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs font-medium">Copy this key now — it is never shown again.</p>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-xs">{value}</code>
        {/*
          Deliberately no copy context: this is the once-shown private key, a live secret. The
          event would carry only the label, never the value — but we don't emit analytics tied to
          handling a secret at all. api_key_created (scope: Private) already records that a private
          key was minted, which is the activation signal; the copy itself stays untracked.
        */}
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => copy(value)}>
          {copied ? <Check className="size-3.5 text-green-600 dark:text-green-400" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  )
}

const ApiKeys = () => {
  const project = useAtomValue(activeProjectAtom)
  const projectHeaders = useAtomValue(projectHeaderAtom)
  const projectsRPC = useAtomValue(projectsRPCAtom)
  const { keys, loading, refreshing, error, reload } = useApiKeys()

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ApiKeyKind>(ApiKeyKind.PUBLIC)
  const [creating, setCreating] = useState(false)
  const [newPrivateKey, setNewPrivateKey] = useState<string | null>(null)
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const closeCreate = () => {
    setShowCreate(false)
    setName('')
    setKind(ApiKeyKind.PUBLIC)
  }

  const handleCreate = async () => {
    if (!projectHeaders) return
    setCreating(true)
    try {
      const resp = await projectsRPC.createApiKey({ kind, displayName: name.trim() }, { headers: projectHeaders })
      // scope, not displayName: which kind gets minted is the signal (a private key means someone
      // is wiring up a server SDK), while the name is the customer's own free text and buys nothing.
      trackEvent('api_key_created', { apiKeyId: resp.apiKey?.id ?? '', scope: kindLabel(kind) })
      // A private key is returned exactly once, here — hold it until dismissed. A public key needs
      // no banner: ListApiKeys returns its value in full, every time.
      if (kind === ApiKeyKind.PRIVATE) setNewPrivateKey(resp.key)
      closeCreate()
      await reload()
    } catch (err) {
      toastRPCError(err, 'Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!projectHeaders) return
    setRevoking(id)
    try {
      await projectsRPC.deleteApiKey({ id }, { headers: projectHeaders })
      trackEvent('api_key_revoked', { apiKeyId: id })
      setConfirmingRevoke(null)
      await reload()
    } catch (err) {
      toastRPCError(err, 'Failed to revoke API key')
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {project && (
        <section>
          <SectionHeader title="Project" description="Identifies this project to the Pug SDKs, alongside a key." />
          <div className="max-w-xl">
            <CopyableCode label="Project ID" value={project.id} />
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          title="API Keys"
          count={loading || error ? undefined : keys.length}
          description={
            // Two lines, one per kind — spans (not divs) because SectionHeader renders this inside a <p>.
            <>
              <span className="block">Public keys ship in your app and send events.</span>
              <span className="block">
                Private keys authenticate server-side callers and are shown once, when created.{' '}
                <a
                  href={AUTH_DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
                >
                  Authentication docs
                  <ExternalLink className="size-3" />
                </a>
              </span>
            </>
          }
        />

        {newPrivateKey && <NewPrivateKey value={newPrivateKey} onDismiss={() => setNewPrivateKey(null)} />}

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={reload} disabled={refreshing}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {keys.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="py-2 pr-4 text-left font-medium">Name</th>
                    <th className="py-2 pr-4 text-left font-medium">Type</th>
                    <th className="py-2 pr-4 text-left font-medium">Key</th>
                    <th className="py-2 pr-4 text-left font-medium">Created</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => {
                    const created = tsToDate(k.createTime)
                    return (
                      <tr
                        key={k.id}
                        className="group border-b border-border/50 transition-colors hover:bg-muted/40"
                        onMouseLeave={() => setConfirmingRevoke(null)}
                      >
                        <td className="py-2.5 pr-4 text-sm">
                          {k.displayName || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge variant={k.kind === ApiKeyKind.PRIVATE ? 'default' : 'secondary'} className="text-xs">
                            {kindLabel(k.kind)}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4">
                          <KeyValue apiKey={k} />
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">
                          {created ? (
                            <HoverSwap primary={formatRelative(created)} secondary={formatDateTime(created)} />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <Can action="delete" resource="api_key">
                            {revoking === k.id ? (
                              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                            ) : confirmingRevoke === k.id ? (
                              <button
                                type="button"
                                onClick={() => handleRevoke(k.id)}
                                className="whitespace-nowrap text-xs font-medium text-destructive underline-offset-2 hover:underline"
                              >
                                Revoke?
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmingRevoke(k.id)}
                                aria-label={`Revoke ${k.displayName || kindLabel(k.kind)} key`}
                                className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </Can>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <KeyRound className="mb-3 size-8 opacity-15" />
                <p className="text-sm text-muted-foreground">This project has no API keys.</p>
              </div>
            )}

            {/* Creating a key is admin-only (api_key:create); everyone else just sees the list. */}
            <Can action="create" resource="api_key">
              {showCreate ? (
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    placeholder="Key name (optional)"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreate()
                      if (e.key === 'Escape') closeCreate()
                    }}
                    maxLength={150}
                    disabled={creating}
                    className="flex-1"
                  />
                  <Select value={kind} onValueChange={v => setKind(v ?? ApiKeyKind.PUBLIC)} disabled={creating}>
                    <SelectTrigger className="shrink-0">
                      <SelectValue>{v => kindLabel(v ?? ApiKeyKind.PUBLIC)}</SelectValue>
                    </SelectTrigger>
                    {/* The trigger renders from SelectValue's render fn, not from ItemText, so these
                        descriptions stay in the dropdown instead of collapsing into the closed trigger. */}
                    <SelectContent align="start" alignItemWithTrigger={false} className="w-auto min-w-0 p-1">
                      <SelectItem value={ApiKeyKind.PUBLIC} className="py-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span>Public</span>
                          <span className="text-xs text-muted-foreground">Safe to ship in your app. Sends events.</span>
                        </div>
                      </SelectItem>
                      <SelectItem value={ApiKeyKind.PRIVATE} className="py-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span>Private</span>
                          <span className="text-xs text-muted-foreground">
                            Server-side only. Shown once, at creation.
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    aria-label="Create key"
                    className="rounded-md p-1 text-link hover:bg-muted disabled:opacity-50"
                  >
                    {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={closeCreate}
                    aria-label="Cancel"
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                // Barred while an uncopied private key is on screen: the slot holds one, so a
                // second create would overwrite a value that cannot be recovered.
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(true)
                    setTimeout(() => inputRef.current?.focus(), 0)
                  }}
                  disabled={!!newPrivateKey}
                  className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus className="size-4" />
                  New key
                </button>
              )}
            </Can>
          </>
        )}
      </section>
    </div>
  )
}

export default ApiKeys
