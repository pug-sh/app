import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue, useSetAtom } from 'jotai'
import { Eye, EyeOff, Loader2, Lock, Mail, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import { demoEnabledAtom, googleOAuthEnabledAtom, requestMagicLinkAtom, signInAtom } from '@/auth/auth.atoms'
import { GoogleSignInButton } from '@/auth/google-sign-in-button'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SignInWall } from '@/pages/sign-in-wall'

const authSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
})

type AuthFormData = z.infer<typeof authSchema>

// GIS renders its own button at 40px and can't be restyled, so it sets the control
// rhythm here — inputs and the submit button match it rather than the app's h-8 default.
const controlHeight = 'h-10'

const SignIn = () => {
  const signIn = useSetAtom(signInAtom)
  const requestMagicLink = useSetAtom(requestMagicLinkAtom)
  const googleOAuthEnabled = useAtomValue(googleOAuthEnabledAtom)
  const demoEnabled = useAtomValue(demoEnabledAtom)
  const [, navigate] = useLocation()
  // Magic link is the primary path — the backend creates the account on first use,
  // so it covers both returning and brand-new users. Password sign-in is opt-in for
  // people who set a password via the in-app SetPassword flow.
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
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

  const authBusy = loading || magicLinkLoading

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Left — the form, directly on the canvas. No card and no colour change at the midpoint:
          the wall vignettes into this same background, so the halves share one surface.
          min-w-0: on lg this is a flex item, so its default min-width:auto floors it at its
          content's min-content — the GIS button's fixed 384px width — and it can't shrink below
          that, overflowing (clipped right) on phones narrower than ~432px. min-w-0 lets the
          column track the viewport (GoogleSignInButton drops its own overflow clip in reliance
          on this). */}
      <div className="relative z-10 flex min-h-screen min-w-0 flex-1 flex-col px-6 py-10 lg:min-h-screen lg:w-1/2">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center justify-center gap-2.5">
              <img src="/logo.svg" alt="" className="h-8 w-8" />
              <span className="text-lg font-medium tracking-tight text-display-foreground">Pug</span>
            </div>

            {magicLinkSent ? (
              <div className="text-center">
                <div className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <MailCheck className="h-5 w-5 text-link" />
                </div>
                <h1 className="text-2xl font-medium tracking-tight text-display-foreground">Check your inbox</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  We sent a sign-in link to{' '}
                  <span className="font-medium break-all text-foreground">{magicLinkEmail}</span>. Click it to continue
                  — it expires in 15 minutes.
                </p>
                <button
                  type="button"
                  className="mt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
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
                <h1 className="text-center text-3xl font-medium tracking-tight text-display-foreground">
                  {mode === 'link' ? 'Sign in to Pug' : 'Sign in with password'}
                </h1>
                <p className="mt-2 mb-6 text-center text-sm text-muted-foreground">
                  {mode === 'link'
                    ? "We'll email you a secure link to sign in or create your account."
                    : 'Enter the password you set for your account'}
                </p>

                {googleOAuthEnabled && (
                  <>
                    <GoogleSignInButton disabled={authBusy} onBegin={() => setError('')} onError={setError} />
                    <div className="my-5 flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">or continue with email</span>
                      <div className="h-px flex-1 bg-border" />
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
                    <div className="relative">
                      <Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
                      <Input
                        {...authForm.register('email')}
                        id="email"
                        type="email"
                        placeholder="you@company.com"
                        className={`${controlHeight} pl-9`}
                        aria-invalid={!!authForm.formState.errors.email}
                        autoComplete="email"
                      />
                    </div>
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
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          Forgot?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
                        <Input
                          {...authForm.register('password')}
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          className={`${controlHeight} pr-9 pl-9`}
                          aria-invalid={!!authForm.formState.errors.password}
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {authForm.formState.errors.password && (
                        <FieldError errors={[authForm.formState.errors.password]} />
                      )}
                    </Field>
                  )}

                  {error && <p className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-negative">{error}</p>}

                  {/* The only saturated thing on the page — the accent-tinted shadow is what
                      makes it the single obvious next step. */}
                  <Button
                    type="submit"
                    className={`${controlHeight} w-full shadow-lg shadow-primary/25`}
                    disabled={authBusy}
                  >
                    {(mode === 'link' ? magicLinkLoading : loading) && <Loader2 className="animate-spin" />}
                    {mode === 'link' ? 'Email me a sign-in link' : 'Sign in'}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => switchMode(mode === 'link' ? 'password' : 'link')}
                    disabled={authBusy}
                    className="text-sm font-medium text-link underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    {mode === 'link' ? 'Sign in with password' : 'Email me a sign-in link instead'}
                  </button>
                </div>

                {demoEnabled && (
                  <div className="mt-3 text-center">
                    <button
                      type="button"
                      onClick={() => navigate('/demo')}
                      disabled={authBusy}
                      className="text-xs font-medium text-link underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      Explore the live demo →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-faint">
          by{' '}
          <a
            href="https://tshoka.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline-offset-4 hover:underline"
          >
            tshoka
          </a>
        </p>
      </div>

      {/* Right — the product itself, drifting. Desktop only: it's decoration, and the rotated
          wall has no useful small-screen form. */}
      <div className="relative hidden lg:block lg:w-1/2">
        <SignInWall />
      </div>
    </div>
  )
}

export default SignIn
