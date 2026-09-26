import { clone } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue } from 'jotai'
import { Check, Globe, Loader2, Plus, X } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  type DomainSettings,
  DomainStatus,
  type OrgDomain,
  OrgDomainSchema,
  OrgRole,
} from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { orgsRPCAtom } from '@/api/rpc'
import { Can } from '@/auth/can'
import { roleLabel } from '@/auth/permissions'
import LoadingSpinner from '@/components/loading-spinner'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'
import { DomainRow } from './domain-row'

const notADomain = 'Enter a domain name such as acme.com'

const addDomainSchema = z.object({
  // z.regexes.hostname takes an IP address; the proto's hostname rule refuses an all-digit last label.
  domain: z
    .string()
    .trim()
    .regex(z.regexes.hostname, notADomain)
    .refine(domain => !/(^|\.)\d+\.?$/.test(domain), notADomain),
})
type AddDomainFormData = z.infer<typeof addDomainSchema>

const SettingRow = ({
  title,
  description,
  control,
  children,
}: {
  title: string
  description: string
  control: ReactNode
  children?: ReactNode
}) => (
  <div className="flex items-start justify-between gap-6 py-3">
    <div className="min-w-0">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      {children}
    </div>
    <div className="shrink-0 pt-0.5">{control}</div>
  </div>
)

const adminOnly = <p className="text-sm text-muted-foreground">Only admins can manage SSO and domains.</p>

const SsoDomains = () => {
  const org = useAtomValue(activeOrgAtom)
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const [settings, setSettings] = useState<DomainSettings | null>(null)
  const [domains, setDomains] = useState<OrgDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [verifying, setVerifying] = useState<string[]>([])
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string[]>([])
  const [updatingSSO, setUpdatingSSO] = useState<string[]>([])
  const addForm = useForm<AddDomainFormData>({
    resolver: zodResolver(addDomainSchema),
    defaultValues: { domain: '' },
  })
  const adding = addForm.formState.isSubmitting

  const orgId = org?.id
  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    setDenied(false)
    try {
      const resp = await orgsRPC.listDomains({ orgId })
      setSettings(resp.settings ?? null)
      setDomains(resp.domains)
    } catch (err) {
      console.error('Failed to load domains:', err)
      const code = err instanceof ConnectError ? err.code : undefined
      // A demoted admin's role stays stale until a reload, which Retry doesn't do.
      if (code === Code.PermissionDenied) setDenied(true)
      else setError(code === Code.Unimplemented ? "This server doesn't support domains yet." : 'Failed to load domains')
    } finally {
      setLoading(false)
    }
  }, [orgId, orgsRPC])

  useEffect(() => {
    load()
  }, [load])

  // After an action, worked or not: a failed reload toasts rather than swapping the page for an error.
  const refresh = async () => {
    if (!orgId) return
    try {
      const resp = await orgsRPC.listDomains({ orgId })
      setSettings(resp.settings ?? null)
      setDomains(resp.domains)
    } catch (err) {
      toastRPCError(err, 'Failed to refresh domains')
    }
  }

  // The action's own result, so it shows even if the reload fails; the flags only ListDomains sets stay.
  const applyDomain = (updated: OrgDomain | undefined) => {
    if (!updated) return
    setDomains(ds =>
      ds.map(d => {
        if (d.id !== updated.id) return d
        // Not a spread: that drops every unset field, which a message reads from its prototype.
        const merged = clone(OrgDomainSchema, updated)
        merged.orgCreationRestrictedElsewhere = d.orgCreationRestrictedElsewhere
        merged.ssoRequiredElsewhere = d.ssoRequiredElsewhere
        return merged
      }),
    )
  }

  const save = async (next: { autoJoinRole: OrgRole; membersCanCreateOrgs: boolean }) => {
    if (!orgId) return
    setSaving(true)
    try {
      const resp = await orgsRPC.setDomainSettings({ orgId, ...next })
      setSettings(resp.settings ?? null)
    } catch (err) {
      toastRPCError(err, 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  const closeAdd = () => {
    setShowAdd(false)
    addForm.reset()
  }

  const handleAdd = async ({ domain }: AddDomainFormData) => {
    if (!orgId) return
    try {
      const { domain: added } = await orgsRPC.addDomain({ orgId, domain })
      if (added) setDomains(ds => (ds.some(d => d.id === added.id) ? ds : [...ds, added]))
    } catch (err) {
      toastRPCError(err, 'Failed to add domain')
      return
    }
    closeAdd()
    await refresh()
  }

  // Reloads on failure too, so a domain removed elsewhere drops out instead of failing on every click.
  const handleVerify = async (domain: OrgDomain) => {
    if (!orgId) return
    setVerifying(ids => [...ids, domain.id])
    try {
      applyDomain((await orgsRPC.verifyDomain({ orgId, domainId: domain.id })).domain)
      toast.success(`${domain.domain} is verified`)
    } catch (err) {
      toastRPCError(err, 'Failed to verify domain')
    }
    await refresh()
    setVerifying(ids => ids.filter(id => id !== domain.id))
  }

  const handleRemove = async (domain: OrgDomain) => {
    if (!orgId) return
    setRemoving(ids => [...ids, domain.id])
    try {
      await orgsRPC.removeDomain({ orgId, domainId: domain.id })
    } catch (err) {
      toastRPCError(err, 'Failed to remove domain')
    }
    setConfirmingRemove(null)
    await refresh()
    setRemoving(ids => ids.filter(id => id !== domain.id))
  }

  const handleRequireSSO = async (domain: OrgDomain, on: boolean) => {
    if (!orgId) return
    setUpdatingSSO(ids => [...ids, domain.id])
    try {
      applyDomain((await orgsRPC.updateDomain({ orgId, domainId: domain.id, requireSso: on })).domain)
    } catch (err) {
      toastRPCError(err, 'Failed to update Require SSO')
    }
    await refresh()
    setUpdatingSSO(ids => ids.filter(id => id !== domain.id))
  }

  if (loading) return <LoadingSpinner />
  if (denied) return adminOnly

  if (error || !settings) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">{error ?? 'Failed to load domains'}</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    )
  }

  const hasVerified = domains.some(d => d.status === DomainStatus.VERIFIED)
  const autoJoinOn = settings.autoJoinRole !== OrgRole.UNSPECIFIED
  const canCreateOrgs = settings.membersCanCreateOrgs
  const restrictedElsewhere = domains.filter(d => d.orgCreationRestrictedElsewhere).map(d => d.domain)
  // Turning auto-join on, raising it to Member, or restricting org creation acts on other people, so
  // each needs a verified domain. Going back to the default always works.
  const needsDomain = hasVerified ? undefined : 'Verify a domain first.'

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <SectionHeader title="Joining" />
        <SettingRow
          title="Auto-join"
          description="People who sign in through SSO with an email on a verified domain join this organization."
          control={
            <Switch
              checked={autoJoinOn}
              disabled={saving || (!autoJoinOn && !hasVerified)}
              aria-label="Auto-join"
              onCheckedChange={on =>
                save({
                  autoJoinRole: on ? OrgRole.VIEWER : OrgRole.UNSPECIFIED,
                  membersCanCreateOrgs: canCreateOrgs,
                })
              }
            />
          }
        >
          {autoJoinOn ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              Role for new people
              <Select
                value={settings.autoJoinRole}
                disabled={saving}
                onValueChange={role =>
                  role !== null && save({ autoJoinRole: role, membersCanCreateOrgs: canCreateOrgs })
                }
              >
                <SelectTrigger size="sm">
                  <SelectValue>{v => roleLabel(v ?? settings.autoJoinRole)}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false} className="w-auto min-w-0 p-1">
                  <SelectItem value={OrgRole.VIEWER}>Viewer</SelectItem>
                  <SelectItem value={OrgRole.MEMBER} disabled={!hasVerified}>
                    Member
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            needsDomain && <p className="mt-1 text-xs text-muted-foreground">{needsDomain}</p>
          )}
        </SettingRow>

        <SettingRow
          title="Let members create their own organizations"
          description="When off, people with an email on a verified domain can't create new organizations, and get none when they sign up. Admins of this organization still can."
          control={
            <Switch
              checked={canCreateOrgs}
              disabled={saving || (canCreateOrgs && !hasVerified)}
              aria-label="Let members create their own organizations"
              onCheckedChange={on => save({ autoJoinRole: settings.autoJoinRole, membersCanCreateOrgs: on })}
            />
          }
        >
          {restrictedElsewhere.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Also turned off by another organization that verified {restrictedElsewhere.join(', ')}.
            </p>
          )}
          {canCreateOrgs && needsDomain && <p className="mt-1 text-xs text-muted-foreground">{needsDomain}</p>}
        </SettingRow>
      </section>

      <section>
        <SectionHeader
          title="Domains"
          count={domains.length}
          description="Prove your organization owns a domain with a DNS record. The settings above apply to every verified domain, including ones verified later."
        />
        {domains.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Globe className="mb-3 size-8 opacity-15" />
            <p className="text-sm text-muted-foreground">No domains yet.</p>
          </div>
        ) : (
          domains.map(d => (
            <DomainRow
              key={d.id}
              domain={d}
              verifying={verifying.includes(d.id)}
              confirmingRemove={confirmingRemove === d.id}
              removing={removing.includes(d.id)}
              onVerify={() => handleVerify(d)}
              onConfirmRemove={() => setConfirmingRemove(d.id)}
              onRemove={() => handleRemove(d)}
              onCancelRemove={() => setConfirmingRemove(null)}
              updatingSSO={updatingSSO.includes(d.id)}
              onRequireSSO={on => handleRequireSSO(d, on)}
            />
          ))
        )}

        {showAdd ? (
          <form onSubmit={addForm.handleSubmit(handleAdd)} className="mt-3">
            <Field data-invalid={!!addForm.formState.errors.domain}>
              <div className="flex items-center gap-2">
                <Input
                  {...addForm.register('domain')}
                  placeholder="acme.com"
                  autoFocus
                  maxLength={253}
                  disabled={adding}
                  aria-invalid={!!addForm.formState.errors.domain}
                  className="flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Escape') closeAdd()
                  }}
                />
                <button
                  type="submit"
                  disabled={adding}
                  aria-label="Add domain"
                  className="rounded-md p-1 text-link hover:bg-muted disabled:opacity-50"
                >
                  {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={closeAdd}
                  disabled={adding}
                  aria-label="Cancel"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              {addForm.formState.errors.domain && <FieldError errors={[addForm.formState.errors.domain]} />}
            </Field>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="size-4" />
            Add domain
          </button>
        )}
      </section>
    </div>
  )
}

const SsoDomainsPage = () => (
  <Can action="read" resource="domain" fallback={adminOnly}>
    <SsoDomains />
  </Can>
)

export default SsoDomainsPage
