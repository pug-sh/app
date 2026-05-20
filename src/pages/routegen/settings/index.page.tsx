import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, Copy, Loader2, Lock, Plus, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  activeOrgAtom,
  activeProjectAtom,
  createOrgAtom,
  fetchOrgsAtom,
  leaveOrgAtom,
  orgsAtom,
  projectHeaderAtom,
  selectOrgAtom,
} from '@/data/workspace.atoms'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { toastRPCError } from '@/lib/rpc-error'

const orgSchema = z.object({
  displayName: z.string().min(1, 'Organization name is required').max(150, 'Name must be at most 150 characters'),
})

const createOrgSchema = z.object({
  displayName: z.string().min(1, 'Required').max(150, 'Max 150 characters'),
})
type CreateOrgFormData = z.infer<typeof createOrgSchema>

const projectSchema = z.object({
  displayName: z.string().min(1, 'Project name is required').max(150, 'Name must be at most 150 characters'),
})

const fcmSchema = z.object({
  fcmJSON: z
    .string()
    .min(1, 'FCM JSON is required')
    .refine(val => {
      try {
        JSON.parse(val)
        return true
      } catch {
        return false
      }
    }, 'Invalid JSON'),
})

type OrgFormData = z.infer<typeof orgSchema>
type ProjectFormData = z.infer<typeof projectSchema>
type FcmFormData = z.infer<typeof fcmSchema>

const CopyId = ({ value }: { value: string }) => {
  const { copied, copy } = useCopyToClipboard()
  return (
    <button
      onClick={() => copy(value)}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors cursor-pointer"
    >
      {value}
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

const Settings = () => {
  const [org, setOrg] = useAtom(activeOrgAtom)
  const [project, setProject] = useAtom(activeProjectAtom)
  const projectHeaders = useAtomValue(projectHeaderAtom)
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const projectsRPC = useAtomValue(projectsRPCAtom)

  const [savingOrg, setSavingOrg] = useState(false)
  const [savingProject, setSavingProject] = useState(false)
  const [savingFcm, setSavingFcm] = useState(false)
  const [savedOrg, setSavedOrg] = useState(false)
  const [savedProject, setSavedProject] = useState(false)
  const [savedFcm, setSavedFcm] = useState(false)
  const savedOrgTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savedProjectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savedFcmTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const orgForm = useForm<OrgFormData>({
    resolver: zodResolver(orgSchema),
    defaultValues: { displayName: org?.displayName ?? '' },
  })

  const projectForm = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: { displayName: project?.displayName ?? '' },
  })

  const fcmForm = useForm<FcmFormData>({
    resolver: zodResolver(fcmSchema),
    defaultValues: { fcmJSON: '' },
  })

  const orgs = useAtomValue(orgsAtom)
  const fetchOrgs = useSetAtom(fetchOrgsAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const createOrg = useSetAtom(createOrgAtom)
  const leaveOrg = useSetAtom(leaveOrgAtom)

  const [pendingOrgId, setPendingOrgId] = useState('')
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const createOrgForm = useForm<CreateOrgFormData>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { displayName: '' },
  })

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

  useEffect(() => {
    if (org?.displayName !== undefined) {
      orgForm.reset({ displayName: org.displayName })
    }
  }, [org, orgForm])

  useEffect(() => {
    if (project?.displayName !== undefined) {
      projectForm.reset({ displayName: project.displayName })
    }
  }, [project, projectForm])

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

  const handleRenameProject = async (data: ProjectFormData) => {
    if (!projectHeaders) {
      console.warn('handleRenameProject called without project headers')
      return
    }
    setSavingProject(true)
    try {
      await projectsRPC.updateDisplayName({ displayName: data.displayName }, { headers: projectHeaders })
      setProject({ ...project!, displayName: data.displayName })
      setSavedProject(true)
      clearTimeout(savedProjectTimer.current)
      savedProjectTimer.current = setTimeout(() => setSavedProject(false), 2000)
    } catch (err) {
      toastRPCError(err, 'Failed to rename project')
    } finally {
      setSavingProject(false)
    }
  }

  const handleFCMUpload = async (data: FcmFormData) => {
    if (!projectHeaders) {
      console.warn('handleFCMUpload called without project headers')
      return
    }
    setSavingFcm(true)
    try {
      await projectsRPC.updateFCMServiceJSON({ fcmServiceJson: data.fcmJSON }, { headers: projectHeaders })
      fcmForm.reset({ fcmJSON: '' })
      setSavedFcm(true)
      clearTimeout(savedFcmTimer.current)
      savedFcmTimer.current = setTimeout(() => setSavedFcm(false), 2000)
    } catch (err) {
      toastRPCError(err, 'Failed to upload FCM config')
    } finally {
      setSavingFcm(false)
    }
  }

  return (
    <Page title="Settings" description="Manage project settings">
      <div className="space-y-8 max-w-2xl">
        <section>
          <SectionHeader title="API Endpoint" description="Configured via VITE_API_BASE_URL environment variable" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border border-border/50 px-2.5 py-2 rounded-md font-mono">
            <Lock className="w-3 h-3 shrink-0" />
            <span className="break-all">{import.meta.env.VITE_API_BASE_URL}</span>
          </div>
        </section>

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

        {project && projectHeaders && (
          <>
            <section>
              <SectionHeader title="Project name" description="Rename this project" />
              <form onSubmit={projectForm.handleSubmit(handleRenameProject)} className="space-y-3">
                <Field data-invalid={!!projectForm.formState.errors.displayName}>
                  <FieldLabel htmlFor="project-name">Project Name</FieldLabel>
                  <Input
                    {...projectForm.register('displayName')}
                    id="project-name"
                    maxLength={150}
                    aria-invalid={!!projectForm.formState.errors.displayName}
                  />
                  {projectForm.formState.errors.displayName && (
                    <FieldError errors={[projectForm.formState.errors.displayName]} />
                  )}
                </Field>
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={savingProject || !projectForm.formState.isDirty}
                  >
                    {savingProject ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                  {savedProject && <span className="text-xs text-green-600 animate-in fade-in">Saved</span>}
                </div>
              </form>
            </section>

            <section>
              <SectionHeader
                title="FCM Service Account"
                description="Paste your Firebase Cloud Messaging service account JSON"
              />
              <form onSubmit={fcmForm.handleSubmit(handleFCMUpload)} className="space-y-3">
                <Field data-invalid={!!fcmForm.formState.errors.fcmJSON}>
                  <FieldLabel htmlFor="fcm-json">Service Account JSON</FieldLabel>
                  <Textarea
                    {...fcmForm.register('fcmJSON')}
                    id="fcm-json"
                    className="font-mono min-h-30"
                    placeholder={`{\n  "type": "service_account",\n  "project_id": "your-project-id",\n  "private_key_id": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",\n  "client_email": "firebase-adminsdk-...@your-project.iam.gserviceaccount.com"\n}`}
                    aria-invalid={!!fcmForm.formState.errors.fcmJSON}
                  />
                  {fcmForm.formState.errors.fcmJSON && <FieldError errors={[fcmForm.formState.errors.fcmJSON]} />}
                </Field>
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" disabled={savingFcm || !fcmForm.formState.isDirty}>
                    {savingFcm ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}
                    Upload
                  </Button>
                  {savedFcm && <span className="text-xs text-green-600 animate-in fade-in">Uploaded</span>}
                </div>
              </form>
            </section>
          </>
        )}
      </div>
    </Page>
  )
}

export default Settings
