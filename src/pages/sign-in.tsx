import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Eye, EyeOff, Loader2, Lock, Mail, MailCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import {
  type AuthProviderConfig,
  AuthProviderType,
  type GetAuthConfigResponse,
} from '@/api/genproto/public/auth/v1/auth_pb'
import {
  type AuthResult,
  authConfigAtom,
  demoEnabledAtom,
  discoverSignInAtom,
  reloadAuthConfigAtom,
  requestMagicLinkAtom,
  signInAtom,
} from '@/auth/auth.atoms'
import { AuthStatus } from '@/auth/auth-status'
import { providerKey } from '@/auth/oidc'
import { OIDCSignInButton } from '@/auth/oidc-sign-in-button'
import { ssoBlockAtom } from '@/auth/sso-required'
import { SSORequiredScreen } from '@/auth/sso-required-screen'
import { useTurnstile } from '@/auth/use-turnstile'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const authSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
})

type AuthFormData = z.infer<typeof authSchema>

const controlHeight = 'h-10'

const MODE_COPY = {
  link: {
    title: 'Sign in to Pug',
    blurb: "We'll email you a secure link to sign in or create your account.",
    submit: 'Continue',
    toggle: 'Sign in with password',
  },
  password: {
    title: 'Sign in with password',
    blurb: 'Enter the password you set for your account',
    submit: 'Sign in',
    toggle: 'Email me a sign-in link instead',
  },
}

type SSOStep = { email: string; domain: string; providers: AuthProviderConfig[]; requireSso: boolean }

const orList = new Intl.ListFormat('en', { type: 'disjunction' })

const SignIn = () => {
  const signIn = useSetAtom(signInAtom)
  const requestMagicLink = useSetAtom(requestMagicLinkAtom)
  const discoverSignIn = useSetAtom(discoverSignInAtom)
  const authConfig = useAtomValue(authConfigAtom)
  const reloadAuthConfig = useSetAtom(reloadAuthConfigAtom)
  const demoEnabled = useAtomValue(demoEnabledAtom)
  const [, navigate] = useLocation()
  // Magic link is the primary path — the backend creates the account on first use,
  // so it covers both returning and brand-new users. Password sign-in is opt-in for
  // people who set a password via the in-app SetPassword flow.
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [error, setError] = useState('')
  // One in-flight action at a time: an email method or a sign-in button's key, so every button shares the gate.
  const [pending, setPending] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  // Doubles as the "link sent" flag — a separate boolean lets sent-with-no-email be represented.
  const [magicLinkEmail, setMagicLinkEmail] = useState('')
  // Also set by the transport when a session refresh is refused for the same reason.
  const [ssoBlock, setSSOBlock] = useAtom(ssoBlockAtom)
  const [ssoStep, setSSOStep] = useState<SSOStep | null>(null)
  const [reloadedConfig, setReloadedConfig] = useState<GetAuthConfigResponse | null>(null)

  const config = reloadedConfig ?? authConfig
  const oidcProviders = config?.providers.filter(provider => provider.type === AuthProviderType.OIDC) ?? []
  const siteKey = config?.turnstileSiteKey ?? ''
  const turnstile = useTurnstile(siteKey)

  // A provider redirect leaves the page with `pending` set; bfcache restores it that way on Back,
  // which would leave every control disabled.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const authForm = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' },
  })

  // Derived from the current email, so editing it hides the step.
  const step = mode === 'link' && ssoStep?.email === authForm.watch('email') ? ssoStep : null

  const withProviders = (message: string) => {
    const names = (step?.providers ?? oidcProviders).map(provider => provider.displayName)
    return names.length > 0 ? `${message} You can still continue with ${orList.format(names)}.` : message
  }

  const verify = async () => {
    const token = await turnstile.take()
    if (token === null) {
      setError(withProviders("Verification couldn't run in this browser. Reload the page and try again."))
    }
    return token
  }

  const showFailure = async (result: Extract<AuthResult, { ok: false }>) => {
    // No site key: the check went on after this page loaded, or the first config fetch failed.
    if (result.turnstile === 'failed' && !siteKey) {
      const reloaded = await reloadAuthConfig()
      if (reloaded) setReloadedConfig(reloaded)
    }
    setError(result.turnstile === 'unavailable' ? withProviders(result.error) : result.error)
  }

  // Password sign-in. handleSubmit runs the full schema (email + password) first.
  const submitPassword = async (data: AuthFormData) => {
    setError('')
    setPending('password')
    try {
      const turnstileToken = await verify()
      if (turnstileToken === null) return
      const result = await signIn({ ...data, turnstileToken })
      if (result.ok) return
      if (result.ssoRequired) setSSOBlock({ detail: result.ssoRequired, email: data.email })
      else await showFailure(result)
    } catch (err) {
      console.error('sign-in submit failed', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(null)
    }
  }

  // Both email actions only need the email — validate that field alone so an empty
  // password (link mode never renders one) can't block the request.
  const withEmail = async (action: (email: string) => Promise<void>) => {
    setError('')
    authForm.clearErrors('password')
    const valid = await authForm.trigger('email')
    if (!valid) return
    setPending('link')
    try {
      await action(authForm.getValues('email'))
    } catch (err) {
      console.error('email sign-in failed', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(null)
    }
  }

  const sendLink = async (email: string) => {
    const turnstileToken = await verify()
    if (turnstileToken === null) return
    const res = await requestMagicLink({ email, turnstileToken })
    if (res.ok) setMagicLinkEmail(email)
    else if (res.ssoRequired) setSSOBlock({ detail: res.ssoRequired, email })
    else await showFailure(res)
  }

  // Only a connection or Require SSO skips the link, not Google listed for a domain like gmail.com.
  const continueWithEmail = async (email: string) => {
    const discovery = await discoverSignIn({ email })
    if (authForm.getValues('email') !== email) return
    const providers = discovery?.providers.filter(provider => provider.type === AuthProviderType.OIDC) ?? []
    const viaSSO = discovery?.requireSso || providers.some(provider => provider.connectionId)
    if (discovery && providers.length > 0 && viaSSO) {
      setSSOStep({ email, domain: discovery.domain, providers, requireSso: discovery.requireSso })
      return
    }
    await sendLink(email)
  }

  const toggleMode = () => {
    setMode(m => (m === 'link' ? 'password' : 'link'))
    setError('')
    authForm.clearErrors()
  }

  const authBusy = pending !== null
  const copy = MODE_COPY[mode]

  if (ssoBlock) {
    const { domain } = ssoBlock.detail
    let description = `Passwords and email links are turned off for ${domain}.`
    if (ssoBlock.sessionEnded) description = `SSO is now required for ${domain}. Sign in again to continue.`
    return (
      <SSORequiredScreen
        detail={ssoBlock.detail}
        email={ssoBlock.email}
        description={description}
        onUseDifferentEmail={() => setSSOBlock(null)}
      />
    )
  }

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
        // Click autocapture would send the SSO step's text or an error, either of which can name a connection.
        <div data-pug-no-capture={step || error ? '' : undefined}>
          <h1 className="text-center text-3xl tracking-tight">{copy.title}</h1>
          <p className="mt-2 mb-6 text-center text-sm text-muted-foreground">
            {step ? `${step.domain} accounts sign in through SSO.` : copy.blurb}
          </p>

          {oidcProviders.length > 0 && (
            <>
              <div className="space-y-2">
                {oidcProviders.map(provider => (
                  <OIDCSignInButton
                    key={providerKey(provider)}
                    provider={provider}
                    disabled={authBusy}
                    loading={pending === providerKey(provider)}
                    onBegin={() => {
                      setError('')
                      setPending(providerKey(provider))
                    }}
                    onError={message => {
                      setPending(null)
                      setError(message)
                    }}
                  />
                ))}
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
                withEmail(continueWithEmail)
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
                    onClick={() => withEmail(sendLink)}
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

            {/* Empty until Cloudflare wants a click, so it adds no gap. */}
            {siteKey && <div ref={turnstile.ref} />}

            {error && <p className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-negative">{error}</p>}

            {step ? (
              <div className="space-y-2">
                {step.providers.map(provider => {
                  // Its own key, so a provider also listed above doesn't spin both buttons.
                  const key = `step:${providerKey(provider)}`
                  return (
                    <OIDCSignInButton
                      key={key}
                      provider={provider}
                      options={{ loginHint: step.email, domain: step.domain }}
                      disabled={authBusy}
                      loading={pending === key}
                      onBegin={() => {
                        setError('')
                        setPending(key)
                      }}
                      onError={message => {
                        setPending(null)
                        setError(message)
                      }}
                    />
                  )
                })}
              </div>
            ) : (
              <Button type="submit" className={`${controlHeight} w-full`} disabled={authBusy}>
                {pending === mode && <Loader2 className="animate-spin" />}
                {copy.submit}
              </Button>
            )}
          </form>

          {!step?.requireSso && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={step ? () => withEmail(sendLink) : toggleMode}
                disabled={authBusy}
                className="text-sm font-medium text-link underline-offset-4 hover:underline disabled:opacity-50"
              >
                {step ? 'Email me a link instead' : copy.toggle}
              </button>
            </div>
          )}

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
        </div>
      )}
    </>
  )
}

export default SignIn
