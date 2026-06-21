import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, Copy, Loader2, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  activeOrgAtom,
  createOrgAtom,
  fetchOrgsAtom,
  lastProjectByOrgAtom,
  leaveOrgAtom,
  orgsAtom,
  selectOrgAtom,
} from '@/data/workspace.atoms'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { toastRPCError } from '@/lib/rpc-error'

const orgSchema = z.object({
  displayName: z.string().min(1, 'Organization name is required').max(150, 'Name must be at most 150 characters'),
})
type OrgFormData = z.infer<typeof orgSchema>

const createOrgSchema = z.object({
  displayName: z.string().min(1, 'Required').max(150, 'Max 150 characters'),
})
type CreateOrgFormData = z.infer<typeof createOrgSchema>

const CopyId = ({ value }: { value: string }) => {
  const { copied, copy } = useCopyToClipboard()
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
    >
      {value}
      {copied ? <Check className="size-3 text-green-600 dark:text-green-400" /> : <Copy className="size-3" />}
    </button>
  )
}

const Organization = () => {
  const [org, setOrg] = useAtom(activeOrgAtom)
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const projectsRPC = useAtomValue(projectsRPCAtom)
  const orgs = useAtomValue(orgsAtom)
  const lastProjectByOrg = useAtomValue(lastProjectByOrgAtom)
  const fetchOrgs = useSetAtom(fetchOrgsAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const createOrg = useSetAtom(createOrgAtom)
  const leaveOrg = useSetAtom(leaveOrgAtom)
  const [, navigate] = useLocation()

  const [orgsLoading, setOrgsLoading] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [savingOrg, setSavingOrg] = useState(false)
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const orgForm = useForm<OrgFormData>({
    resolver: zodResolver(orgSchema),
    defaultValues: { displayName: org?.displayName ?? '' },
  })
  const createOrgForm = useForm<CreateOrgFormData>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { displayName: '' },
  })

  useEffect(() => {
    if (org?.displayName !== undefined) {
      orgForm.reset({ displayName: org.displayName })
    }
  }, [org, orgForm])

  const reloadOrgs = useCallback(async () => {
    setOrgsLoading(true)
    try {
      await fetchOrgs()
    } finally {
      setOrgsLoading(false)
    }
  }, [fetchOrgs])

  // Preload the org list on every visit so the switcher is populated without opening it.
  useEffect(() => {
    reloadOrgs()
  }, [reloadOrgs])

  const handleSwitchOrg = async (orgId: string) => {
    const target = orgs.find(o => o.id === orgId)
    if (!target || target.id === org?.id) return
    setRenaming(false)
    setConfirmingLeave(false)
    try {
      // Load the new org's projects first, then stay on this settings tab for one of
      // them. The old project id in the URL would otherwise read as "Project not found".
      const { projects } = await projectsRPC.batchGet({ orgId: target.id })
      selectOrg(target)
      // Prefer the last project visited in this org, falling back to the first.
      const lastId = lastProjectByOrg[target.id]
      const next = projects.find(p => p.id === lastId) ?? projects[0]
      navigate(next ? `/p/${next.id}/settings/organization` : '/', { replace: true })
    } catch (err) {
      toastRPCError(err, 'Failed to switch organization')
    }
  }

  const handleCreateOrg = async ({ displayName }: CreateOrgFormData) => {
    setCreatingOrg(true)
    try {
      const created = await createOrg(displayName.trim())
      if (!created) throw new Error('Create returned no org')
      setShowCreateOrg(false)
      createOrgForm.reset()
    } catch (err) {
      toastRPCError(err, 'Failed to create organization')
    } finally {
      setCreatingOrg(false)
    }
  }

  const handleLeaveOrg = async () => {
    if (!org) return
    setLeaving(true)
    try {
      await leaveOrg(org.id)
      navigate('/', { replace: true })
    } catch (err) {
      toastRPCError(err, 'Failed to leave organization')
      setConfirmingLeave(false)
    } finally {
      setLeaving(false)
    }
  }

  const handleRenameOrg = async (data: OrgFormData) => {
    if (!org) return
    setSavingOrg(true)
    try {
      await orgsRPC.updateDisplayName({ orgId: org.id, displayName: data.displayName })
      setOrg({ ...org, displayName: data.displayName })
      setRenaming(false)
    } catch (err) {
      toastRPCError(err, 'Failed to rename organization')
    } finally {
      setSavingOrg(false)
    }
  }

  const startRename = () => {
    setConfirmingLeave(false)
    orgForm.reset({ displayName: org?.displayName ?? '' })
    setRenaming(true)
  }

  const cancelRename = () => {
    setRenaming(false)
    orgForm.reset({ displayName: org?.displayName ?? '' })
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {org && (
        <section>
          <SectionHeader
            title="Organization"
            description="Switch organizations, or rename and leave the current one."
          />

          {/* Switcher */}
          <div className="flex gap-2">
            <Select value="" onValueChange={v => handleSwitchOrg(v ?? '')}>
              <SelectTrigger className="flex-1 max-w-xs">
                <SelectValue placeholder={org.displayName} />
              </SelectTrigger>
              <SelectContent>
                {orgsLoading ? (
                  <div className="flex justify-center py-3">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  orgs.map(o => (
                    <SelectItem key={o.id} value={o.id} className="py-1.5">
                      <div className="flex flex-col gap-0.5">
                        <span>{o.displayName}</span>
                        <span className="font-mono text-xs text-muted-foreground">{o.id}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={reloadOrgs}
              disabled={orgsLoading}
              aria-label="Reload organizations"
              className="text-muted-foreground"
            >
              {orgsLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>

          {/* Current org: inline-editable name + copyable id */}
          <div className="mt-4 space-y-1">
            {renaming ? (
              <form onSubmit={orgForm.handleSubmit(handleRenameOrg)} className="max-w-xs">
                <Field data-invalid={!!orgForm.formState.errors.displayName}>
                  <Input
                    {...orgForm.register('displayName')}
                    autoFocus
                    maxLength={150}
                    disabled={savingOrg}
                    aria-label="Organization name"
                    aria-invalid={!!orgForm.formState.errors.displayName}
                    className="h-8"
                    onKeyDown={e => {
                      if (e.key === 'Escape') cancelRename()
                    }}
                    onBlur={() => {
                      if (!savingOrg) cancelRename()
                    }}
                  />
                  {orgForm.formState.errors.displayName && (
                    <FieldError errors={[orgForm.formState.errors.displayName]} />
                  )}
                </Field>
              </form>
            ) : (
              <button
                type="button"
                onClick={startRename}
                aria-label="Rename organization"
                className="group inline-flex items-center gap-2 text-sm cursor-pointer"
              >
                <span className="font-medium">{org.displayName}</span>
                <Pencil className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <div>
              <CopyId value={org.id} />
            </div>
          </div>

          {/* New organization + Leave */}
          <div className="mt-4 space-y-2">
            {showCreateOrg ? (
              <form onSubmit={createOrgForm.handleSubmit(handleCreateOrg)} className="max-w-sm">
                <Field data-invalid={!!createOrgForm.formState.errors.displayName}>
                  <div className="flex items-center gap-2">
                    <Input
                      {...createOrgForm.register('displayName')}
                      placeholder="New organization name"
                      autoFocus
                      maxLength={150}
                      disabled={creatingOrg}
                      aria-invalid={!!createOrgForm.formState.errors.displayName}
                      className="h-8"
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          setShowCreateOrg(false)
                          createOrgForm.reset()
                        }
                      }}
                    />
                    {creatingOrg && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateOrg(false)
                        createOrgForm.reset()
                      }}
                      className="shrink-0 text-xs text-muted-foreground hover:underline cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                  {createOrgForm.formState.errors.displayName && (
                    <FieldError errors={[createOrgForm.formState.errors.displayName]} />
                  )}
                </Field>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreateOrg(true)}
                className="flex items-center gap-1.5 text-sm text-link underline-offset-4 hover:underline cursor-pointer"
              >
                <Plus className="size-4" />
                New organization
              </button>
            )}

            {confirmingLeave ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Leave this organization?</span>
                <button
                  type="button"
                  onClick={handleLeaveOrg}
                  disabled={leaving}
                  className="text-destructive hover:underline cursor-pointer disabled:opacity-50"
                >
                  {leaving ? 'Leaving…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingLeave(false)}
                  disabled={leaving}
                  className="text-muted-foreground hover:underline cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingLeave(true)}
                className="block text-sm text-muted-foreground transition-colors hover:text-destructive cursor-pointer"
              >
                Leave organization
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default Organization
