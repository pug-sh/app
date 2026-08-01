import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue, useSetAtom } from 'jotai'
import { ChevronRight, Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { signOutAtom } from '@/auth/auth.atoms'
import { roleLabel } from '@/auth/permissions'
import { NameChip } from '@/components/name-chip'
import SectionHeader from '@/components/section-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createOrgAtom, orgsAtom, selectOrgAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'

// trim() before min(1), so the checks run on the trimmed value and a name of nothing but spaces is
// rejected here instead of reaching createOrg — same ordering as the settings page's schemas.
const createSchema = z.object({
  displayName: z.string().trim().min(1, 'Required').max(150, 'Max 150 characters'),
})
type CreateFormData = z.infer<typeof createSchema>

// Matches sign-in's control rhythm rather than the app's h-8 default — this form opens in the same
// column, at the same width, one screen later.
const controlHeight = 'h-10'

// One shape for every entry in the list, so "create a new one" reads as another place to go.
const rowClass =
  'group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/40'

const SelectOrg = () => {
  const orgs = useAtomValue(orgsAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const createOrg = useSetAtom(createOrgAtom)
  const signOut = useSetAtom(signOutAtom)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { displayName: '' },
  })

  const onCreate = async ({ displayName }: CreateFormData) => {
    setCreating(true)
    try {
      const org = await createOrg(displayName)
      if (!org) throw new Error('Create returned no org')
    } catch (err) {
      toastRPCError(err, 'Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <h1 className="text-center text-3xl tracking-tight">Pick where to start</h1>
      <p className="mt-2 mb-8 text-center text-sm text-muted-foreground">You belong to more than one organization.</p>

      <SectionHeader title="Organizations" count={orgs.length} />

      {/* -mx-2: the hover fill bleeds past the text column, the labels still line up with the header. */}
      <div className="-mx-2 flex flex-col gap-0.5">
        {orgs.map(org => {
          const label = roleLabel(org.role)
          return (
            <button key={org.id} type="button" onClick={() => selectOrg(org)} className={rowClass}>
              <NameChip name={org.displayName} className="size-8 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{org.displayName}</span>
              {label && (
                <Badge variant="secondary" className="shrink-0">
                  {label}
                </Badge>
              )}
              <ChevronRight className="size-4 shrink-0 text-faint transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
            </button>
          )
        })}

        {showCreate ? (
          <form onSubmit={createForm.handleSubmit(onCreate)} className="mt-1 px-2">
            <Field data-invalid={!!createForm.formState.errors.displayName}>
              <Input
                {...createForm.register('displayName')}
                placeholder="Organization name"
                autoFocus
                className={controlHeight}
                aria-invalid={!!createForm.formState.errors.displayName}
                disabled={creating}
              />
              {createForm.formState.errors.displayName && (
                <FieldError errors={[createForm.formState.errors.displayName]} />
              )}
            </Field>
            <div className="mt-2 flex gap-2">
              <Button type="submit" disabled={creating} className={`${controlHeight} flex-1`}>
                {creating && <Loader2 className="animate-spin" />}
                Create
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={controlHeight}
                onClick={() => {
                  setShowCreate(false)
                  createForm.reset()
                }}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setShowCreate(true)} className={rowClass}>
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors group-hover:text-foreground"
              aria-hidden
            >
              <Plus className="size-4" />
            </span>
            <span className="flex-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              Create new organization
            </span>
          </button>
        )}
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Wrong account?{' '}
        <button
          type="button"
          onClick={() => signOut()}
          className="font-medium text-link underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </p>
    </>
  )
}

export default SelectOrg
