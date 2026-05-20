import { ConnectError } from '@connectrpc/connect'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, Bell, Eye, EyeOff, Loader2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import { orgsRPCAtom } from '@/api/rpc'
import { isAuthenticatedAtom, signInAtom, signOutAtom, signUpAtom } from '@/auth/auth.atoms'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { fetchOrgsAtom, selectOrgAtom } from '@/data/workspace.atoms'

const authSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(8, 'Password must be at least 8 characters'),
})

type AuthFormData = z.infer<typeof authSchema>

const Shell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center p-8">
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
          <Bell className="w-4.5 h-4.5 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Pug</span>
      </div>
      {children}
    </div>
  </div>
)

// Signed in: confirm and accept. The backend matches the invite to the
// signed-in account's email and rejects a mismatch (ErrInviteWrongEmail), so
// the wrong-account case surfaces as the accept error here.
const AcceptView = ({ token }: { token: string }) => {
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const fetchOrgs = useSetAtom(fetchOrgsAtom)
  const signOut = useSetAtom(signOutAtom)
  const [, navigate] = useLocation()
  const [status, setStatus] = useState<'idle' | 'accepting' | 'error'>('idle')
  const [error, setError] = useState('')

  const accept = async () => {
    setStatus('accepting')
    setError('')
    try {
      const resp = await orgsRPC.acceptInvite({ token })
      await fetchOrgs()
      if (resp.org) selectOrg(resp.org)
      navigate('/overview')
    } catch (err) {
      setError(err instanceof ConnectError ? err.message : 'Could not accept the invitation.')
      setStatus('error')
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Accept invitation</h1>
      <p className="text-sm text-muted-foreground mt-1.5 mb-8">You've been invited to join an organization on Pug.</p>
      {error && (
        <div className="mb-4 text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button className="w-full" onClick={accept} disabled={status === 'accepting'}>
        {status === 'accepting' && <Loader2 className="animate-spin" />}
        Accept invitation
      </Button>
      {status === 'error' && (
        <p className="text-center text-sm text-muted-foreground mt-6">
          Wrong account?{' '}
          <button
            type="button"
            className="text-primary font-medium hover:underline underline-offset-4 cursor-pointer"
            onClick={() => signOut()}
          >
            Sign out & use another account
          </button>
        </p>
      )}
    </>
  )
}

// Signed out: create an account (the invite token joins the org and skips
// default-org creation) or sign in to an existing account and then accept.
const AuthView = ({ token }: { token: string }) => {
  const signIn = useSetAtom(signInAtom)
  const signUp = useSetAtom(signUpAtom)
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const [, navigate] = useLocation()
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: AuthFormData) => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const res = await signUp({ ...data, inviteToken: token })
        if (!res.ok) {
          setError(res.error)
          return
        }
      } else {
        const res = await signIn(data)
        if (!res.ok) {
          setError(res.error)
          return
        }
        // Signed in to an existing account — now accept the invite for it.
        await orgsRPC.acceptInvite({ token })
      }
      navigate('/overview')
    } catch (err) {
      setError(err instanceof ConnectError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === 'signup' ? 'Accept your invitation' : 'Welcome back'}
      </h1>
      <p className="text-sm text-muted-foreground mt-1.5 mb-8">
        {mode === 'signup' ? 'Create your account to join the organization.' : 'Sign in to accept the invitation.'}
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Field data-invalid={!!form.formState.errors.email}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            {...form.register('email')}
            id="email"
            type="email"
            placeholder="you@company.com"
            aria-invalid={!!form.formState.errors.email}
            autoComplete="email"
          />
          {form.formState.errors.email ? (
            <FieldError errors={[form.formState.errors.email]} />
          ) : (
            mode === 'signup' && (
              <p className="text-xs text-muted-foreground">Use the email this invitation was sent to.</p>
            )
          )}
        </Field>

        <Field data-invalid={!!form.formState.errors.password}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <div className="relative">
            <Input
              {...form.register('password')}
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="pr-9"
              aria-invalid={!!form.formState.errors.password}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.formState.errors.password && <FieldError errors={[form.formState.errors.password]} />}
        </Field>

        {error && <p className="text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {mode === 'signup' ? 'Create account & join' : 'Sign in & join'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        {mode === 'signup' ? 'Already have an account? ' : 'Need a new account? '}
        <button
          type="button"
          className="text-primary font-medium hover:underline underline-offset-4 cursor-pointer"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup')
            setError('')
          }}
        >
          {mode === 'signup' ? 'Sign in' : 'Create account'}
        </button>
      </p>
    </>
  )
}

const AcceptInvite = () => {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const authenticated = useAtomValue(isAuthenticatedAtom)

  if (!token) {
    return (
      <Shell>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h1 className="text-lg font-semibold tracking-tight mb-1">Invalid invitation link</h1>
          <p className="text-sm text-muted-foreground">This link is missing its token. Ask for a fresh invite.</p>
        </div>
      </Shell>
    )
  }

  return <Shell>{authenticated ? <AcceptView token={token} /> : <AuthView token={token} />}</Shell>
}

export default AcceptInvite
