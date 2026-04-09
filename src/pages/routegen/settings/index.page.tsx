import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { activeOrgAtom, activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { toastRPCError } from '@/lib/rpc-error'
import { useAtom, useAtomValue } from 'jotai'
import { Check, Copy, Lock, Loader2, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'

const orgSchema = z.object({
  displayName: z.string().min(1, 'Organization name is required').max(150, 'Name must be at most 150 characters'),
})

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
      className='inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors cursor-pointer'
    >
      {value}
      {copied ? <Check className='w-3 h-3 text-green-600' /> : <Copy className='w-3 h-3' />}
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
    defaultValues: {
      displayName: org?.displayName ?? '',
    },
  })

  const projectForm = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      displayName: project?.displayName ?? '',
    },
  })

  const fcmForm = useForm<FcmFormData>({
    resolver: zodResolver(fcmSchema),
    defaultValues: {
      fcmJSON: '',
    },
  })

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
    if (!org) return
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
    if (!projectHeaders) return
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
    if (!projectHeaders) return
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
    <Page title='Settings' description='Manage project settings'>
      <div className='space-y-8 max-w-2xl'>
        <section>
          <SectionHeader title='API Endpoint' description='Configured via VITE_API_BASE_URL environment variable' />
          <div className='flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border border-border/50 px-2.5 py-2 rounded-md font-mono'>
            <Lock className='w-3 h-3 shrink-0' />
            <span className='break-all'>{import.meta.env.VITE_API_BASE_URL}</span>
          </div>
        </section>

        {org && (
          <section>
            <SectionHeader title='Organization' description='Rename your organization' />
            <form onSubmit={orgForm.handleSubmit(handleRenameOrg)} className='space-y-3'>
              <Controller
                name='displayName'
                control={orgForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Organization Name</FieldLabel>
                    <Input {...field} id={field.name} maxLength={150} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <div className='flex items-center gap-2'>
                <Button type='submit' variant='outline' size='sm' disabled={savingOrg}>
                  {savingOrg ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                  Save
                </Button>
                {savedOrg && <span className='text-xs text-green-600 animate-in fade-in'>Saved</span>}
              </div>
            </form>
            <CopyId value={org.id} />
          </section>
        )}

        {project && projectHeaders && (
          <>
            <section>
              <SectionHeader title='Project name' description='Rename this project' />
              <form onSubmit={projectForm.handleSubmit(handleRenameProject)} className='space-y-3'>
                <Controller
                  name='displayName'
                  control={projectForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Project Name</FieldLabel>
                      <Input {...field} id={field.name} maxLength={150} aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <div className='flex items-center gap-2'>
                  <Button type='submit' variant='outline' size='sm' disabled={savingProject}>
                    {savingProject ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                    Save
                  </Button>
                  {savedProject && <span className='text-xs text-green-600 animate-in fade-in'>Saved</span>}
                </div>
              </form>
            </section>

            <section>
              <SectionHeader
                title='FCM Service Account'
                description='Paste your Firebase Cloud Messaging service account JSON'
              />
              <form onSubmit={fcmForm.handleSubmit(handleFCMUpload)} className='space-y-3'>
                <Controller
                  name='fcmJSON'
                  control={fcmForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Service Account JSON</FieldLabel>
                      <Textarea
                        {...field}
                        id={field.name}
                        className='font-mono min-h-30'
                        placeholder={`{\n  "type": "service_account",\n  "project_id": "your-project-id",\n  "private_key_id": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",\n  "client_email": "firebase-adminsdk-...@your-project.iam.gserviceaccount.com"\n}`}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <div className='flex items-center gap-2'>
                  <Button type='submit' size='sm' disabled={savingFcm}>
                    {savingFcm ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                    Upload
                  </Button>
                  {savedFcm && <span className='text-xs text-green-600 animate-in fade-in'>Uploaded</span>}
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
