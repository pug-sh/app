import { useSetAtom } from 'jotai'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { AuthShell } from '@/auth/auth-shell'
import { completeMagicLinkAtom } from '@/auth/auth.atoms'

const MagicLink = () => {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const completeMagicLink = useSetAtom(completeMagicLinkAtom)
  const [, navigate] = useLocation()
  const [error, setError] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    if (!token) return
    // Single-use token: guard against StrictMode's double-invoked effect, which
    // would consume the token on the first call and fail on the second.
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      const res = await completeMagicLink({ token })
      if (res.ok) navigate('/overview')
      else setError(res.error)
    })()
  }, [token, completeMagicLink, navigate])

  if (!token) {
    return (
      <AuthShell>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h1 className="text-lg font-medium tracking-tight mb-1">Invalid link</h1>
          <p className="text-sm text-muted-foreground">This link is missing its token. Request a new one.</p>
        </div>
      </AuthShell>
    )
  }

  if (error) {
    return (
      <AuthShell>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h1 className="text-lg font-medium tracking-tight mb-1">Couldn't sign you in</h1>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-primary text-sm font-medium hover:underline underline-offset-4 cursor-pointer"
          >
            Back to sign in
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Signing you in…</span>
      </div>
    </AuthShell>
  )
}

export default MagicLink
