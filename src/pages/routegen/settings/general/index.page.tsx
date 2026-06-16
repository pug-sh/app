import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue } from 'jotai'
import { Loader2, Lock, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { projectsRPCAtom } from '@/api/rpc'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'

const projectSchema = z.object({
  displayName: z.string().min(1, 'Project name is required').max(150, 'Name must be at most 150 characters'),
})
type ProjectFormData = z.infer<typeof projectSchema>

const General = () => {
  const [project, setProject] = useAtom(activeProjectAtom)
  const projectHeaders = useAtomValue(projectHeaderAtom)
  const projectsRPC = useAtomValue(projectsRPCAtom)

  const [savingProject, setSavingProject] = useState(false)
  const [savedProject, setSavedProject] = useState(false)
  const savedProjectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const projectForm = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: { displayName: project?.displayName ?? '' },
  })

  useEffect(() => {
    if (project?.displayName !== undefined) {
      projectForm.reset({ displayName: project.displayName })
    }
  }, [project, projectForm])

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

  return (
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
      )}
    </div>
  )
}

export default General
