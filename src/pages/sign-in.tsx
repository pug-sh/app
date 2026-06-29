import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue, useSetAtom } from 'jotai'
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import { demoEnabledAtom, googleOAuthEnabledAtom, requestMagicLinkAtom, signInAtom } from '@/auth/auth.atoms'
import { GoogleSignInButton } from '@/auth/google-sign-in-button'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const authSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
})

type AuthFormData = z.infer<typeof authSchema>

// The Pug mark — an analytics pulse, matching the favicon. Renders in currentColor
// so it works white-on-indigo (hero) and indigo-on-light (mobile header) alike.
const PugPulse = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M3 14h3.5l2.5-7 3 12 2.5-8H21" />
  </svg>
)

// Illustrative time-series area that anchors the hero — full-bleed across the canvas
// so it slides under the form card. Drawn once on load (see .signin-trend-* in
// index.css). Bold stroke + gradient fill so it reads, not just a faint hairline.
const HeroTrend = () => {
  // Sits as a gentle rising wave in the upper part of the band so it clears the
  // caption + footer that anchor the bottom-left.
  const line =
    'M0 138 L40 130 L80 142 L120 114 L160 124 L200 98 L240 108 L280 80 L320 88 L360 60 L400 68 L440 44 L480 36'
  return (
    <svg
      viewBox="0 0 480 220"
      preserveAspectRatio="none"
      className="absolute inset-x-0 bottom-0 w-full h-80"
      aria-hidden
    >
      <defs>
        <linearGradient id="signin-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={0.32} />
          <stop offset="100%" stopColor="white" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path className="signin-trend-area" d={`${line} L480 220 L0 220 Z`} fill="url(#signin-trend-fill)" />
      <path
        className="signin-trend-line"
        d={line}
        fill="none"
        stroke="white"
        strokeOpacity={0.85}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

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
    <div className="min-h-screen flex bg-[oklch(0.63_0.13_265)] relative overflow-hidden">
      {/* Trend spans the full canvas and slides under the form card — no hard cut at the seam. */}
      <HeroTrend />
      {/* Left — analytics hero, directly on the blue canvas. The product, quietly breathing. */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 text-primary-foreground">
        {/* Solid base so the caption + footer stay legible over the trend. */}
        <div
          className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[oklch(0.63_0.13_265)] to-transparent"
          aria-hidden
        />
        <div className="relative z-10 flex flex-col justify-between w-full p-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
              <PugPulse className="w-5 h-5" />
            </div>
            <span className="text-xl font-medium tracking-tight">Pug</span>
          </div>

          <div className="max-w-md">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-60">Product analytics</p>
            <h2 className="mt-4 text-4xl font-medium leading-[1.1] tracking-tight">
              See what your
              <br />
              users actually do.
            </h2>
            <p className="mt-4 max-w-sm text-sm opacity-70 leading-relaxed">
              Track events, funnels, and retention — and turn product behavior into decisions you can ship.
            </p>
          </div>

          <p className="text-xs opacity-70">
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
      </div>

      {/* Right — form on an inset card so it pops against the blue and leads. On mobile the
          card fills the screen edge-to-edge (covering the blue + trend); the inset framing
          (blue gutter + rounded corners) is a desktop-only treatment.
          min-w-0: this is a flex item, so its default min-width:auto floors it at its
          content's min-content — the GIS button's fixed 384px width — and it can't shrink
          below that, overflowing (clipped right) on phones narrower than ~432px. min-w-0
          lets it shrink so the form column tracks the viewport (GoogleSignInButton drops its
          own overflow clip in reliance on this). */}
      <div className="flex-1 lg:w-1/2 lg:p-4 relative z-10 min-w-0">
        <div className="flex h-full w-full items-center justify-center bg-background p-6 lg:rounded-3xl lg:p-8">
          <div className="w-full max-w-sm">
            <div className="lg:hidden flex items-center gap-3 mb-10">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                <PugPulse className="w-4.5 h-4.5" />
              </div>
              <span className="text-lg font-medium tracking-tight">Pug</span>
            </div>

            {magicLinkSent ? (
              <div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-5">
                  <MailCheck className="w-5 h-5 text-link" />
                </div>
                <h1 className="text-2xl font-medium tracking-tight">Check your inbox</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  We sent a sign-in link to{' '}
                  <span className="font-medium text-foreground break-all">{magicLinkEmail}</span>. Click it to continue
                  — it expires in 15 minutes.
                </p>
                <button
                  type="button"
                  className="text-link font-medium text-sm hover:underline underline-offset-4 cursor-pointer mt-6"
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
                <h1 className="text-2xl font-medium tracking-tight">
                  {mode === 'link' ? 'Sign in to Pug' : 'Sign in with password'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5 mb-6">
                  {mode === 'link'
                    ? "We'll email you a secure link to sign in or create your account."
                    : 'Enter the password you set for your account'}
                </p>

                {googleOAuthEnabled && (
                  <>
                    <GoogleSignInButton disabled={authBusy} onBegin={() => setError('')} onError={setError} />
                    <div className="flex items-center gap-3 my-5">
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
                      {authForm.formState.errors.password && (
                        <FieldError errors={[authForm.formState.errors.password]} />
                      )}
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
                    className="text-link font-medium text-sm hover:underline underline-offset-4 cursor-pointer mt-6 disabled:opacity-50"
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

                {demoEnabled && (
                  <div className="mt-6 text-center">
                    <button
                      type="button"
                      onClick={() => navigate('/demo')}
                      disabled={authBusy}
                      className="cursor-pointer text-xs font-medium text-link underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      Explore the live demo →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SignIn
