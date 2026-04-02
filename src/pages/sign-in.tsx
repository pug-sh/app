import { signInAtom, signUpAtom } from '@/auth/auth.atoms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSetAtom } from 'jotai'
import { Bell, Loader2 } from 'lucide-react'
import { useState } from 'react'

const SignIn = () => {
  const signIn = useSetAtom(signInAtom)
  const signUp = useSetAtom(signUpAtom)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const action = mode === 'signin' ? signIn : signUp
    const result = await action({ email, password })
    setLoading(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <div className='min-h-screen flex'>
      {/* Left — branding panel */}
      <div className='hidden lg:flex lg:w-[45%] bg-primary relative overflow-hidden'>
        <div className='absolute inset-0'>
          <div className='absolute top-1/4 -left-20 w-80 h-80 rounded-full bg-white/5' />
          <div className='absolute bottom-1/4 right-0 w-96 h-96 rounded-full bg-white/3' />
          <div className='absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-white/4' />
        </div>
        <div className='relative z-10 flex flex-col justify-between p-12 text-primary-foreground'>
          <div className='flex items-center gap-3'>
            <div className='w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm'>
              <Bell className='w-5 h-5' />
            </div>
            <span className='text-xl font-semibold tracking-tight'>Cotton</span>
          </div>
          <div className='max-w-sm'>
            <p className='text-3xl font-semibold leading-tight tracking-tight'>
              Analytics and
              <br />
              engagement, unified.
            </p>
            <p className='mt-4 text-sm opacity-70 leading-relaxed'>
              Manage campaigns, track delivery, and understand your users — all from one dashboard.
            </p>
          </div>
          <p className='text-xs opacity-40'>Cotton — by Fivebits</p>
        </div>
      </div>

      {/* Right — auth form */}
      <div className='flex-1 flex items-center justify-center p-8'>
        <div className='w-full max-w-sm'>
          <div className='lg:hidden flex items-center gap-3 mb-10'>
            <div className='w-9 h-9 rounded-lg bg-primary flex items-center justify-center'>
              <Bell className='w-4.5 h-4.5 text-primary-foreground' />
            </div>
            <span className='text-lg font-semibold tracking-tight'>Cotton</span>
          </div>

          <h1 className='text-2xl font-semibold tracking-tight'>
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className='text-sm text-muted-foreground mt-1.5 mb-8'>
            {mode === 'signin' ? 'Sign in to your account to continue' : 'Get started with Cotton'}
          </p>

          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='space-y-1.5'>
              <Label htmlFor='email'>Email</Label>
              <Input
                id='email'
                type='email'
                placeholder='you@company.com'
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='password'>Password</Label>
              <Input
                id='password'
                type='password'
                placeholder='••••••••'
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className='text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2'>{error}</p>}

            <Button type='submit' className='w-full' disabled={loading || !email.trim() || !password}>
              {loading && <Loader2 className='animate-spin' />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className='text-center text-sm text-muted-foreground mt-6'>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type='button'
              className='text-primary font-medium hover:underline underline-offset-4 cursor-pointer'
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError('')
              }}
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default SignIn
