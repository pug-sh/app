import { useSetAtom } from 'jotai'
import { Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useLocation } from 'wouter'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { deleteProjectAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'

export const DeleteProject = ({ project }: { project: Project }) => {
  const deleteProject = useSetAtom(deleteProjectAtom)
  const [, navigate] = useLocation()
  const [confirming, setConfirming] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [deleting, setDeleting] = useState(false)

  const confirmed = typedName !== '' && typedName === project.displayName

  const handleDelete = async () => {
    if (!confirmed || deleting) return
    setDeleting(true)
    try {
      const wasActive = await deleteProject(project.id)
      toast.success(`Deleted ${project.displayName}`)
      if (wasActive) navigate('/', { replace: true })
    } catch (err) {
      toastRPCError(err, 'Failed to delete project')
    } finally {
      setDeleting(false)
    }
  }

  const cancel = () => {
    setConfirming(false)
    setTypedName('')
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-6 block text-sm text-muted-foreground transition-colors hover:text-negative"
      >
        Delete project
      </button>
    )
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        handleDelete()
      }}
      className="mt-6 space-y-4"
    >
      <p className="text-sm">
        <span className="font-medium">Delete {project.displayName}?</span>{' '}
        <span className="text-muted-foreground">
          This erases the project's events, profiles, dashboards and API keys. It can't be undone. Events already
          counted stay on your organization's usage.
        </span>
      </p>
      <Field>
        <FieldLabel htmlFor="delete-project-name">Type the project name to confirm</FieldLabel>
        <Input
          id="delete-project-name"
          value={typedName}
          onChange={e => setTypedName(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          disabled={deleting}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="destructive" size="sm" disabled={!confirmed || deleting}>
          {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Delete project
        </Button>
        <button
          type="button"
          onClick={cancel}
          disabled={deleting}
          className="text-sm text-muted-foreground hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
