import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue, useSetAtom } from 'jotai'
import { Check, Copy, Loader2, Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import { Can } from '@/auth/can'
import SectionHeader from '@/components/section-header'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { activeOrgAtom, createOrgAtom, leaveOrgAtom, renameOrgAtom } from '@/data/workspace.atoms'
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

const CopyId = ({ value, context }: { value: string; context?: string }) => {
  const { copied, copy } = useCopyToClipboard()
  return (
    <button
      type="button"
      onClick={() => copy(value, context)}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {value}
      {copied ? <Check className="size-3 text-green-600 dark:text-green-400" /> : <Copy className="size-3" />}
    </button>
  )
}

const Organization = () => {
  const org = useAtomValue(activeOrgAtom)
  const createOrg = useSetAtom(createOrgAtom)
  const renameOrg = useSetAtom(renameOrgAtom)
  const leaveOrg = useSetAtom(leaveOrgAtom)
  const [, navigate] = useLocation()

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

  const handleCreateOrg = async ({ displayName }: CreateOrgFormData) => {
    setCreatingOrg(true)
    try {
      const created = await createOrg(displayName.trim())
      if (!created) throw new Error('Create returned no org')
      setShowCreateOrg(false)
      createOrgForm.reset()
      // createOrg makes the new org active, which strands the /p/:projectId in the URL — it names a
      // project of the org we just left. The new org has none of its own to land on, so hand the
      // route back to ProjectRedirect.
      navigate('/', { replace: true })
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
      await renameOrg({ orgId: org.id, displayName: data.displayName })
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
            description="Rename this organization, create another, or leave it. Switch between them from the sidebar."
          />

          {/* Current org: inline-editable name + copyable id */}
          <div className="space-y-1">
            <Can
              action="update"
              resource="org"
              fallback={<span className="text-sm font-medium">{org.displayName}</span>}
            >
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
                  className="group inline-flex items-center gap-2 text-sm"
                >
                  <span className="font-medium">{org.displayName}</span>
                  <Pencil className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
                </button>
              )}
            </Can>
            <div>
              {/* identifier:* mirrors CopyableCode's convention (Project ID / Public Key) so all
                  identifier copies group under one `copied` breakdown. org.id is our own resource
                  ID, not a secret. */}
              <CopyId value={org.id} context="identifier:Organization ID" />
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
                      className="shrink-0 text-xs text-muted-foreground hover:underline"
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
                className="flex items-center gap-1.5 text-sm text-link underline-offset-4 hover:underline"
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
                  className="text-destructive hover:underline disabled:opacity-50"
                >
                  {leaving ? 'Leaving…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingLeave(false)}
                  disabled={leaving}
                  className="text-muted-foreground hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingLeave(true)}
                className="block text-sm text-muted-foreground transition-colors hover:text-destructive"
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
