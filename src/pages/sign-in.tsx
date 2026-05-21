import { zodResolver } from '@hookform/resolvers/zod'
import { useSetAtom } from 'jotai'
import { Bell, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { requestMagicLinkAtom, signInAtom, signUpAtom } from '@/auth/auth.atoms'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const authSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(8, 'Password must be at least 8 characters'),
})

type AuthFormData = z.infer<typeof authSchema>

const SignIn = () => {
  const signIn = useSetAtom(signInAtom)
  const signUp = useSetAtom(signUpAtom)
  const requestMagicLink = useSetAtom(requestMagicLinkAtom)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
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

  const onSubmit = async (data: AuthFormData) => {
    setError('')
    setLoading(true)
    try {
      const action = mode === 'signin' ? signIn : signUp
      const result = await action(data)
      if (!result.ok) setError(result.error)
    } catch (err) {
      console.error('sign-in submit failed', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Magic link and "Forgot?" share one action: the backend deleted password
  // reset, so recovery is just a sign-in link. Validate only the email field
  // (password may be empty here), request the link, then show the confirmation.
  const handleMagicLink = async () => {
    setError('')
    // This action ignores the password, so drop any stale password validation error.
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
                {mode === 'signin' ? 'Welcome back' : 'Create account'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5 mb-8">
                {mode === 'signin' ? 'Sign in to your account to continue' : 'Get started with Pug'}
              </p>

              <form onSubmit={authForm.handleSubmit(onSubmit)} className="space-y-4">
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

                <Field data-invalid={!!authForm.formState.errors.password}>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={handleMagicLink}
                        disabled={loading || magicLinkLoading}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      {...authForm.register('password')}
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pr-9"
                      aria-invalid={!!authForm.formState.errors.password}
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
                  {authForm.formState.errors.password && <FieldError errors={[authForm.formState.errors.password]} />}
                </Field>

                {error && <p className="text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2">{error}</p>}

                <Button type="submit" className="w-full" disabled={loading || magicLinkLoading}>
                  {loading && <Loader2 className="animate-spin" />}
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Button>
              </form>

              {mode === 'signin' && (
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
                    onClick={handleMagicLink}
                    disabled={loading || magicLinkLoading}
                  >
                    {magicLinkLoading && <Loader2 className="animate-spin" />}
                    Email me a sign-in link
                  </Button>
                </>
              )}

              <p className="text-center text-sm text-muted-foreground mt-6">
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline underline-offset-4 cursor-pointer"
                  onClick={() => {
                    setMode(mode === 'signin' ? 'signup' : 'signin')
                    setError('')
                  }}
                >
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SignIn
