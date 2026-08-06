import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue, useSetAtom } from 'jotai'
import { Eye, EyeOff, Loader2, Lock, Mail, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import { AuthProviderType } from '@/api/genproto/public/auth/v1/auth_pb'
import { authProvidersAtom, demoEnabledAtom, requestMagicLinkAtom, signInAtom } from '@/auth/auth.atoms'
import { AuthStatus } from '@/auth/auth-status'
import { OIDCSignInButton } from '@/auth/oidc-sign-in-button'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const authSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
})

type AuthFormData = z.infer<typeof authSchema>

// External-provider buttons use 40px controls, so inputs and the submit button
// match that rhythm rather than the app's h-8 default.
const controlHeight = 'h-10'

const MODE_COPY = {
  link: {
    title: 'Sign in to Pug',
    blurb: "We'll email you a secure link to sign in or create your account.",
    submit: 'Email me a sign-in link',
    toggle: 'Sign in with password',
  },
  password: {
    title: 'Sign in with password',
    blurb: 'Enter the password you set for your account',
    submit: 'Sign in',
    toggle: 'Email me a sign-in link instead',
  },
}

const SignIn = () => {
  const signIn = useSetAtom(signInAtom)
  const requestMagicLink = useSetAtom(requestMagicLinkAtom)
  const authProviders = useAtomValue(authProvidersAtom)
  const demoEnabled = useAtomValue(demoEnabledAtom)
  const [, navigate] = useLocation()
  // Magic link is the primary path — the backend creates the account on first use,
  // so it covers both returning and brand-new users. Password sign-in is opt-in for
  // people who set a password via the in-app SetPassword flow.
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [error, setError] = useState('')
  // One in-flight action at a time. The value is either an email method or a
  // server-configured provider ID, so any number of external buttons share the gate.
  const [pending, setPending] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  // Doubles as the "link sent" flag — a separate boolean lets sent-with-no-email be represented.
  const [magicLinkEmail, setMagicLinkEmail] = useState('')

  const authForm = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' },
  })

  // Password sign-in. handleSubmit runs the full schema (email + password) first.
  const submitPassword = async (data: AuthFormData) => {
    setError('')
    setPending('password')
    try {
      const result = await signIn(data)
      if (!result.ok) setError(result.error)
    } catch (err) {
      console.error('sign-in submit failed', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(null)
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
    setPending('link')
    try {
      const res = await requestMagicLink({ email })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setMagicLinkEmail(email)
    } catch (err) {
      console.error('magic link request failed', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(null)
    }
  }

  const toggleMode = () => {
    setMode(m => (m === 'link' ? 'password' : 'link'))
    setError('')
    authForm.clearErrors()
  }

  const authBusy = pending !== null
  const copy = MODE_COPY[mode]
  return (
    <>
      {magicLinkEmail ? (
        // Click autocapture sends the clicked element's innerText, and the auth canvas sits outside
        // the <main> marker that blanks it. This screen is the only one on it rendering a real email.
        <div data-pug-no-capture>
          <AuthStatus
            icon={MailCheck}
            title="Check your inbox"
            description={
              <>
                We sent a sign-in link to{' '}
                <span className="font-medium break-all text-foreground">{magicLinkEmail}</span>. Click it to continue —
                it expires in 15 minutes.
              </>
            }
          >
            <button
              type="button"
              className="mt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
              onClick={() => {
                setMagicLinkEmail('')
                setError('')
              }}
            >
              Use a different email
            </button>
          </AuthStatus>
        </div>
      ) : (
        <>
          <h1 className="text-center text-3xl tracking-tight">{copy.title}</h1>
          <p className="mt-2 mb-6 text-center text-sm text-muted-foreground">{copy.blurb}</p>

          {authProviders.length > 0 && (
            <>
              <div className="space-y-2">
                {authProviders.map(provider => {
                  if (provider.type === AuthProviderType.OIDC) {
                    return (
                      <OIDCSignInButton
                        key={provider.id}
                        provider={provider}
                        disabled={authBusy}
                        loading={pending === provider.id}
                        onBegin={() => {
                          setError('')
                          setPending(provider.id)
                        }}
                        onError={message => {
                          setPending(null)
                          setError(message)
                        }}
                      />
                    )
                  }
                  return null
                })}
              </div>
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
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint"
                  aria-hidden
                />
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
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint"
                    aria-hidden
                  />
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
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
                {authForm.formState.errors.password && <FieldError errors={[authForm.formState.errors.password]} />}
              </Field>
            )}

            {error && <p className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-negative">{error}</p>}

            <Button type="submit" className={`${controlHeight} w-full`} disabled={authBusy}>
              {pending === mode && <Loader2 className="animate-spin" />}
              {copy.submit}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              disabled={authBusy}
              className="text-sm font-medium text-link underline-offset-4 hover:underline disabled:opacity-50"
            >
              {copy.toggle}
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
    </>
  )
}

export default SignIn
