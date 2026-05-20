import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, Copy, Loader2, Plus, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { orgsRPCAtom } from '@/api/rpc'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  activeOrgAtom,
  createOrgAtom,
  fetchOrgsAtom,
  leaveOrgAtom,
  orgsAtom,
  selectOrgAtom,
} from '@/data/workspace.atoms'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { toastRPCError } from '@/lib/rpc-error'
import SettingsLayout from '../settings-layout'

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
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors cursor-pointer"
    >
      {value}
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

const Organization = () => {
  const [org, setOrg] = useAtom(activeOrgAtom)
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const orgs = useAtomValue(orgsAtom)
  const fetchOrgs = useSetAtom(fetchOrgsAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const createOrg = useSetAtom(createOrgAtom)
  const leaveOrg = useSetAtom(leaveOrgAtom)

  const [savingOrg, setSavingOrg] = useState(false)
  const [savedOrg, setSavedOrg] = useState(false)
  const savedOrgTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const [pendingOrgId, setPendingOrgId] = useState('')
  const [orgsLoading, setOrgsLoading] = useState(false)
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

  const handleOpenOrgPicker = async (open: boolean) => {
    if (!open || orgs.length > 0) return
    setOrgsLoading(true)
    try {
      await fetchOrgs()
    } finally {
      setOrgsLoading(false)
    }
  }

  const handleSwitchOrg = () => {
    const target = orgs.find(o => o.id === pendingOrgId)
    if (!target || target.id === org?.id) return
    selectOrg(target)
    setPendingOrgId('')
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
    } catch (err) {
      toastRPCError(err, 'Failed to leave organization')
      setConfirmingLeave(false)
    } finally {
      setLeaving(false)
    }
  }

  const handleRenameOrg = async (data: OrgFormData) => {
    if (!org) {
      console.warn('handleRenameOrg called without active org')
      return
    }
    setSavingOrg(true)
    try {
      await orgsRPC.updateDisplayName({ orgId: org.id, displayName: data.displayName })
      setOrg({ ...org, displayName: data.displayName })
      setSavedOrg(true)
      clearTimeout(savedOrgTimer.current)
      savedOrgTimer.current = setTimeout(() => setSavedOrg(false), 2000)
    } catch (err) {
      toastRPCError(err, 'Failed to rename organization')
    } finally {
      setSavingOrg(false)
    }
  }

  return (
    <SettingsLayout>
      <div className="space-y-8 max-w-2xl">
        {org && (
          <section>
            <SectionHeader title="Organization" description="Switch, create, leave, or rename your organization" />
            <div className="space-y-3 mb-4">
              <Field>
                <FieldLabel>Current organization</FieldLabel>
                <div className="flex gap-2">
                  <Select
                    value={pendingOrgId}
                    onValueChange={v => setPendingOrgId(v ?? '')}
                    onOpenChange={handleOpenOrgPicker}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={org.displayName} />
                    </SelectTrigger>
                    <SelectContent>
                      {orgsLoading ? (
                        <div className="flex justify-center py-3">
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        orgs.map(o => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.displayName}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSwitchOrg}
                    disabled={!pendingOrgId || pendingOrgId === org.id}
                  >
                    Switch
                  </Button>
                </div>
              </Field>

              {showCreateOrg ? (
                <form onSubmit={createOrgForm.handleSubmit(handleCreateOrg)}>
                  <Field data-invalid={!!createOrgForm.formState.errors.displayName}>
                    <FieldLabel>New organization name</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        {...createOrgForm.register('displayName')}
                        placeholder="Organization name"
                        autoFocus
                        aria-invalid={!!createOrgForm.formState.errors.displayName}
                        disabled={creatingOrg}
                        className="flex-1"
                      />
                      <Button type="submit" size="sm" disabled={creatingOrg}>
                        {creatingOrg && <Loader2 className="size-4 animate-spin" />}
                        Create
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowCreateOrg(false)
                          createOrgForm.reset()
                        }}
                        disabled={creatingOrg}
                      >
                        Cancel
                      </Button>
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
                  className="flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  New organization
                </button>
              )}

              <div className="pt-2">
                {confirmingLeave ? (
                  <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={handleLeaveOrg} disabled={leaving}>
                      {leaving && <Loader2 className="size-4 animate-spin" />}
                      Confirm leave
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmingLeave(false)} disabled={leaving}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmingLeave(true)}>
                    Leave organization
                  </Button>
                )}
              </div>
            </div>
            <form onSubmit={orgForm.handleSubmit(handleRenameOrg)} className="space-y-3">
              <Field data-invalid={!!orgForm.formState.errors.displayName}>
                <FieldLabel htmlFor="org-name">Organization Name</FieldLabel>
                <Input
                  {...orgForm.register('displayName')}
                  id="org-name"
                  maxLength={150}
                  aria-invalid={!!orgForm.formState.errors.displayName}
                />
                {orgForm.formState.errors.displayName && <FieldError errors={[orgForm.formState.errors.displayName]} />}
              </Field>
              <div className="flex items-center gap-2">
                <Button type="submit" variant="outline" size="sm" disabled={savingOrg || !orgForm.formState.isDirty}>
                  {savingOrg ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </Button>
                {savedOrg && <span className="text-xs text-green-600 animate-in fade-in">Saved</span>}
              </div>
            </form>
            <CopyId value={org.id} />
          </section>
        )}
      </div>
    </SettingsLayout>
  )
}

export default Organization
