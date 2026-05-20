import { Code, ConnectError } from '@connectrpc/connect'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, Bell, Eye, EyeOff, Loader2 } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import { orgsRPCAtom } from '@/api/rpc'
import {
  acceptInviteSignUpAtom,
  fetchMeAtom,
  isAuthenticatedAtom,
  meAtom,
  signInAtom,
  signOutAtom,
} from '@/auth/auth.atoms'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { fetchOrgsAtom, selectOrgAtom } from '@/data/workspace.atoms'

const passwordField = z.string().min(1, 'Password is required').min(8, 'Password must be at least 8 characters')

const signinSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: passwordField,
})

const signupSchema = z.object({
  email: z.string(),
  password: passwordField,
})

// Both schemas have the same {email, password} shape; signinSchema has the stricter email rules, so its inferred type
// is the one to use. In signup mode the email field is unused and stays '' — don't read data.email there.
type AuthFormData = z.infer<typeof signinSchema>

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
// signed-in account's email and rejects a mismatch with CodePermissionDenied
// (ErrInviteWrongEmail), so the wrong-account case is detected by code here.
const AcceptView = ({ token }: { token: string }) => {
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const me = useAtomValue(meAtom)
  const fetchMe = useSetAtom(fetchMeAtom)
  const selectOrg = useSetAtom(selectOrgAtom)
  const fetchOrgs = useSetAtom(fetchOrgsAtom)
  const signOut = useSetAtom(signOutAtom)
  const [, navigate] = useLocation()
  const [status, setStatus] = useState<'idle' | 'accepting' | 'error'>('idle')
  const [error, setError] = useState('')
  const [wrongAccount, setWrongAccount] = useState(false)

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  const accept = async () => {
    setStatus('accepting')
    setError('')
    setWrongAccount(false)
    try {
      const resp = await orgsRPC.acceptInvite({ token })
      await fetchOrgs()
      if (resp.org) selectOrg(resp.org)
      navigate('/overview')
    } catch (err) {
      if (err instanceof ConnectError && err.code === Code.AlreadyExists) {
        // Already a member — that's the goal state, not a failure. Go in.
        await fetchOrgs()
        navigate('/overview')
        return
      }
      if (err instanceof ConnectError && err.code === Code.PermissionDenied) {
        setWrongAccount(true)
        setError(
          me?.email
            ? `This invitation isn't for ${me.email}. Sign out and use the invited address.`
            : "This invitation isn't for this account. Sign out and use the invited address.",
        )
      } else if (err instanceof ConnectError && err.code === Code.FailedPrecondition) {
        setError('This invitation has expired or is no longer valid — ask for a fresh one.')
      } else {
        if (!(err instanceof ConnectError)) console.error('acceptInvite unexpected error', err)
        setError(err instanceof ConnectError ? err.message : 'Could not accept the invitation.')
      }
      setStatus('error')
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Accept invitation</h1>
      <div className="mb-8">
        <p className="text-sm text-muted-foreground mt-1.5">You've been invited to join an organization on Pug.</p>
        {me?.email && (
          <p className="text-sm text-muted-foreground mt-1">
            Signed in as <span className="font-medium text-foreground">{me.email}</span>
          </p>
        )}
      </div>
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
      {wrongAccount && (
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

// Signed out: create an account (the invite token joins the org and the backend
// derives the email from the invite, so signup asks only for a password) or sign
// in to an existing account and then accept.
const AuthView = ({ token }: { token: string }) => {
  const signIn = useSetAtom(signInAtom)
  const acceptInviteSignUp = useSetAtom(acceptInviteSignUpAtom)
  const [, navigate] = useLocation()
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<AuthFormData>({
    resolver: zodResolver(mode === 'signup' ? signupSchema : signinSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: AuthFormData) => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const res = await acceptInviteSignUp({ password: data.password, inviteToken: token })
        if (!res.ok) {
          setError(res.error)
          return
        }
        navigate('/overview')
      } else {
        const res = await signIn({ email: data.email, password: data.password })
        if (!res.ok) {
          setError(res.error)
          return
        }
        // Signed in. The parent now renders <AcceptView>, which owns the accept
        // (with wrong-account / already-member / expired handling). We don't accept
        // inline — this view unmounts the instant auth state flips, losing any error.
      }
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
        {mode === 'signin' && (
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
            {form.formState.errors.email && <FieldError errors={[form.formState.errors.email]} />}
          </Field>
        )}

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
            form.clearErrors()
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
