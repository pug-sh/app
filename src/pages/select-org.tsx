import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue, useSetAtom } from 'jotai'
import { Bell, ChevronRight, Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { OrgRole } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { signOutAtom } from '@/auth/auth.atoms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createOrgAtom, orgsAtom, selectOrgAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'

const createSchema = z.object({
  displayName: z.string().min(1, 'Required').max(150, 'Max 150 characters'),
})
type CreateFormData = z.infer<typeof createSchema>

const roleLabel = (role: OrgRole) => {
  if (role === OrgRole.ADMIN) return 'ADMIN'
  if (role === OrgRole.MEMBER) return 'MEMBER'
  return null
}

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
      const org = await createOrg(displayName.trim())
      if (!org) throw new Error('Create returned no org')
    } catch (err) {
      toastRPCError(err, 'Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — branding panel (copied from sign-in.tsx) */}
      <div className="hidden lg:flex lg:w-[45%] bg-primary relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 -left-20 w-80 h-80 rounded-full bg-white/5" />
          <div className="absolute bottom-1/4 right-0 w-96 h-96 rounded-full bg-white/3" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-white/4" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
              <Bell className="w-5 h-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Pug</span>
          </div>
          <div className="max-w-sm">
            <p className="text-3xl font-semibold leading-tight tracking-tight">
              Pick where to
              <br />
              get started.
            </p>
            <p className="mt-4 text-sm opacity-70 leading-relaxed">
              You belong to several organizations. Choose one to continue, or create a new one.
            </p>
          </div>
          <p className="text-xs opacity-40">
            Pug — by{' '}
            <a href="https://tshoka.com" className="underline-offset-2 hover:underline">
              tshoka
            </a>
          </p>
        </div>
      </div>

      {/* Right — picker */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Bell className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Pug</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Choose an organization</h1>
          <p className="text-sm text-muted-foreground mt-1.5 mb-8">You belong to several. Pick one to continue.</p>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organizations</span>
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground">{orgs.length}</span>
          </div>

          <ul>
            {orgs.map(org => {
              const label = roleLabel(org.role)
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    onClick={() => selectOrg(org)}
                    className="group w-full flex items-center gap-3 py-3 border-b border-border/50 transition-colors hover:bg-muted/40 cursor-pointer text-left"
                  >
                    <span className="flex-1 font-medium">{org.displayName}</span>
                    {label && (
                      <Badge variant="secondary" className="text-[10px] tracking-wider">
                        {label}
                      </Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </li>
              )
            })}
          </ul>

          {showCreate ? (
            <form onSubmit={createForm.handleSubmit(onCreate)} className="mt-4 space-y-2">
              <Field data-invalid={!!createForm.formState.errors.displayName}>
                <Input
                  {...createForm.register('displayName')}
                  placeholder="Organization name"
                  autoFocus
                  aria-invalid={!!createForm.formState.errors.displayName}
                  disabled={creating}
                />
                {createForm.formState.errors.displayName && (
                  <FieldError errors={[createForm.formState.errors.displayName]} />
                )}
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={creating} className="flex-1">
                  {creating && <Loader2 className="size-4 animate-spin" />}
                  Create
                </Button>
                <Button
                  type="button"
                  variant="outline"
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
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create new organization
            </button>
          )}

          <div className="mt-10 flex justify-end">
            <button
              type="button"
              onClick={() => signOut()}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SelectOrg
