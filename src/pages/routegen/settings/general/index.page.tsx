import { Code, ConnectError } from '@connectrpc/connect'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue } from 'jotai'
import { Loader2, Lock, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { projectsRPCAtom } from '@/api/rpc'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'
import { browserTimezone } from '@/lib/timezone'
import SettingsLayout from '../settings-layout'
import { TimezonePicker } from './timezone-picker'

const projectSchema = z.object({
  displayName: z.string().min(1, 'Project name is required').max(150, 'Name must be at most 150 characters'),
  // Mirror the proto charset so a malformed value surfaces before the RPC; '' = UTC.
  reportingTimezone: z
    .string()
    .max(64, 'Timezone must be at most 64 characters')
    .regex(/^[A-Za-z0-9_+/-]*$/, 'Invalid timezone'),
})
type ProjectFormData = z.infer<typeof projectSchema>

const General = () => {
  const [project, setProject] = useAtom(activeProjectAtom)
  const projectHeaders = useAtomValue(projectHeaderAtom)
  const projectsRPC = useAtomValue(projectsRPCAtom)

  const [savingProject, setSavingProject] = useState(false)
  const [savedProject, setSavedProject] = useState(false)
  const savedProjectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Browser zone surfaced as a convenience entry in the picker, not the stored value.
  const detectedTimezone = useMemo(() => browserTimezone(), [])

  // Pre-fill from the project's stored zone ('' = UTC).
  const storedTimezone = project?.reportingTimezone ?? ''

  const projectForm = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: { displayName: project?.displayName ?? '', reportingTimezone: storedTimezone },
  })

  useEffect(() => {
    if (project?.displayName !== undefined) {
      projectForm.reset({ displayName: project.displayName, reportingTimezone: storedTimezone })
    }
  }, [project, storedTimezone, projectForm])

  const reportingTimezone = projectForm.watch('reportingTimezone')

  const handleSaveProject = async (data: ProjectFormData) => {
    if (!projectHeaders) {
      console.warn('handleSaveProject called without project headers')
      return
    }
    setSavingProject(true)
    try {
      // UpdateMeta is a full replace — always send reportingTimezone or a rename would
      // clear the stored zone to UTC.
      await projectsRPC.updateMeta(
        { displayName: data.displayName, reportingTimezone: data.reportingTimezone },
        { headers: projectHeaders },
      )
      setProject({ ...project!, displayName: data.displayName, reportingTimezone: data.reportingTimezone })
      setSavedProject(true)
      clearTimeout(savedProjectTimer.current)
      savedProjectTimer.current = setTimeout(() => setSavedProject(false), 2000)
    } catch (err) {
      // updateMeta sends both fields, so an InvalidArgument could be about either. Only
      // pin it to the timezone field when the server error actually names the zone (the
      // strict path rejecting a well-formed-but-unknown zone); otherwise surface the real
      // server message via toast rather than mislabeling it.
      const isTimezoneRejection =
        err instanceof ConnectError && err.code === Code.InvalidArgument && /timezone/i.test(err.message)
      if (isTimezoneRejection) {
        projectForm.setError('reportingTimezone', { message: 'This timezone was rejected by the server' })
      } else {
        toastRPCError(err, 'Failed to save project')
      }
    } finally {
      setSavingProject(false)
    }
  }

  return (
    <SettingsLayout>
      <div className="space-y-8 max-w-2xl">
        <section>
          <SectionHeader title="API Endpoint" description="Configured via VITE_API_BASE_URL environment variable" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border border-border/50 px-2.5 py-2 rounded-md font-mono">
            <Lock className="w-3 h-3 shrink-0" />
            <span className="break-all">{import.meta.env.VITE_API_BASE_URL}</span>
          </div>
        </section>

        {project && projectHeaders && (
          <section>
            <SectionHeader title="Project" description="Project name and reporting timezone" />
            <form onSubmit={projectForm.handleSubmit(handleSaveProject)} className="space-y-4">
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

              <Field data-invalid={!!projectForm.formState.errors.reportingTimezone}>
                <FieldLabel htmlFor="project-timezone">Reporting Timezone</FieldLabel>
                <TimezonePicker
                  value={reportingTimezone}
                  detected={detectedTimezone}
                  onChange={value =>
                    projectForm.setValue('reportingTimezone', value, { shouldDirty: true, shouldValidate: true })
                  }
                  invalid={!!projectForm.formState.errors.reportingTimezone}
                />
                <p className="text-xs text-muted-foreground">
                  Controls how days, weeks, and months are grouped in insights and dashboards.
                </p>
                {projectForm.formState.errors.reportingTimezone && (
                  <FieldError errors={[projectForm.formState.errors.reportingTimezone]} />
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
        )}
      </div>
    </SettingsLayout>
  )
}

export default General
