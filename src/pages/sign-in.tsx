import { zodResolver } from '@hookform/resolvers/zod'
import { useSetAtom } from 'jotai'
import { Bell, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { beginGoogleOAuthAtom, requestMagicLinkAtom, signInAtom } from '@/auth/auth.atoms'
import { isGoogleOAuthEnabled } from '@/auth/oauth'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const authSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(8, 'Password must be at least 8 characters'),
})

type AuthFormData = z.infer<typeof authSchema>

const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
    />
    <path
      fill="currentColor"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="currentColor"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="currentColor"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
)

const SignIn = () => {
  const signIn = useSetAtom(signInAtom)
  const requestMagicLink = useSetAtom(requestMagicLinkAtom)
  const beginGoogleOAuth = useSetAtom(beginGoogleOAuthAtom)
  const googleOAuthEnabled = isGoogleOAuthEnabled()
  // Magic link is the primary path — the backend creates the account on first use,
  // so it covers both returning and brand-new users. Password sign-in is opt-in for
  // people who set a password via the in-app SetPassword flow.
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [magicLinkEmail, setMagicLinkEmail] = useState('')

  const authForm = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' },
  })

  // Password sign-in. handleSubmit runs the full schema (email + password) first.
  const submitPassword = async (data: AuthFormData) => {
    setError('')
    setLoading(true)
    try {
      const result = await signIn(data)
      if (!result.ok) setError(result.error)
    } catch (err) {
      console.error('sign-in submit failed', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Requesting a link only needs the email — validate that field alone so an empty
  // password (link mode never renders one) can't block the request.
  const handleMagicLink = async () => {
    setError('')
    authForm.clearErrors('password')
    const valid = await authForm.trigger('email')
    if (!valid) return
    const email = authForm.getValues('email')
    setMagicLinkLoading(true)
    try {
      const res = await requestMagicLink({ email })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setMagicLinkEmail(email)
      setMagicLinkSent(true)
    } catch (err) {
      console.error('magic link request failed', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setMagicLinkLoading(false)
    }
  }

  const switchMode = (next: 'link' | 'password') => {
    setMode(next)
    setError('')
    authForm.clearErrors()
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      const res = await beginGoogleOAuth()
      if (!res.ok) setError(res.error)
    } catch (err) {
      console.error('google oauth begin failed', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setGoogleLoading(false)
    }
  }

  const authBusy = loading || magicLinkLoading || googleLoading

  return (
    <div className="min-h-screen flex">
      {/* Left — branding panel */}
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
              Analytics and
              <br />
              engagement, unified.
            </p>
            <p className="mt-4 text-sm opacity-70 leading-relaxed">
              Manage campaigns, track delivery, and understand your users — all from one dashboard.
            </p>
          </div>
          <p className="text-xs opacity-40">Pug — by Fivebits</p>
        </div>
      </div>

      {/* Right — auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Bell className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Pug</span>
          </div>

          {magicLinkSent ? (
            <div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-5">
                <MailCheck className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                We sent a sign-in link to{' '}
                <span className="font-medium text-foreground break-all">{magicLinkEmail}</span>. Click it to continue —
                it expires in 15 minutes.
              </p>
              <button
                type="button"
                className="text-primary font-medium text-sm hover:underline underline-offset-4 cursor-pointer mt-6"
                onClick={() => {
                  setMagicLinkSent(false)
                  setError('')
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                {mode === 'link' ? 'Sign in to Pug' : 'Sign in with password'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5 mb-8">
                {mode === 'link'
                  ? "We'll email you a secure link to sign in or create your account."
                  : 'Enter the password you set for your account'}
              </p>

              {googleOAuthEnabled && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    disabled={authBusy}
                    onClick={handleGoogleSignIn}
                  >
                    {googleLoading ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
                    Continue with Google
                  </Button>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">or continue with email</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                </>
              )}

              <form
                onSubmit={e => {
                  e.preventDefault()
                  if (mode === 'password') {
                    authForm.handleSubmit(submitPassword)()
                  } else {
                    handleMagicLink()
                  }
                }}
                className="space-y-4"
              >
                <Field data-invalid={!!authForm.formState.errors.email}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    {...authForm.register('email')}
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    aria-invalid={!!authForm.formState.errors.email}
                    autoComplete="email"
                  />
                  {authForm.formState.errors.email && <FieldError errors={[authForm.formState.errors.email]} />}
                </Field>

                {mode === 'password' && (
                  <Field data-invalid={!!authForm.formState.errors.password}>
                    <div className="flex items-center justify-between">
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <button
                        type="button"
                        onClick={handleMagicLink}
                        disabled={authBusy}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        {...authForm.register('password')}
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        className="pr-9"
                        aria-invalid={!!authForm.formState.errors.password}
                        autoComplete="current-password"
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
                    {authForm.formState.errors.password && <FieldError errors={[authForm.formState.errors.password]} />}
                  </Field>
                )}

                {error && <p className="text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2">{error}</p>}

                <Button type="submit" className="w-full" disabled={authBusy}>
                  {(mode === 'link' ? magicLinkLoading : loading) && <Loader2 className="animate-spin" />}
                  {mode === 'link' ? 'Email me a sign-in link' : 'Sign in'}
                </Button>
              </form>

              {googleOAuthEnabled ? (
                <button
                  type="button"
                  onClick={() => switchMode(mode === 'link' ? 'password' : 'link')}
                  disabled={authBusy}
                  className="text-primary font-medium text-sm hover:underline underline-offset-4 cursor-pointer mt-6 disabled:opacity-50"
                >
                  {mode === 'link' ? 'Sign in with password' : 'Email me a sign-in link instead'}
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => switchMode(mode === 'link' ? 'password' : 'link')}
                    disabled={authBusy}
                  >
                    {mode === 'link' ? 'Sign in with password' : 'Email me a sign-in link instead'}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SignIn
