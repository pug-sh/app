import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { demoSignInAtom, isAuthenticatedAtom } from '@/auth/auth.atoms'
import { AuthShell } from '@/auth/auth-shell'
import { isDemoSessionAtom } from '@/auth/demo'
import { Button } from '@/components/ui/button'

// Public entry for the read-only demo viewer. A logged-out visitor is signed in automatically; a
// visitor already in the demo drops straight into the app; a visitor signed in to their own account
// is asked to confirm first, since entering the demo replaces (signs out) their real session.
const Demo = () => {
  const [, navigate] = useLocation()
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const isDemo = useAtomValue(isDemoSessionAtom)
  const demoSignIn = useSetAtom(demoSignInAtom)
  const [error, setError] = useState('')
  const [switching, setSwitching] = useState(false)
  // One-shot guard: blocks StrictMode's double-invoked effect, and stops the effect from re-running
  // (re-navigating) once a successful sign-in flips `authenticated`/`isDemo` (the confirm path sets
  // it before minting, for the same reason).
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    // Already in the demo (reload or revisit) — drop straight into the app, no re-mint.
    if (authenticated && isDemo) {
      startedRef.current = true
      navigate('/overview')
      return
    }
    // Logged-out visitor — mint the demo viewer session automatically.
    if (!authenticated) {
      startedRef.current = true
      ;(async () => {
        const res = await demoSignIn()
        if (res.ok) navigate('/overview')
        else setError(res.error)
      })()
    }
    // Authenticated as a real user — do nothing here; the confirm interstitial below handles it so
    // we never silently replace their session.
  }, [authenticated, isDemo, demoSignIn, navigate])

  // Real user explicitly chose the demo: mint it in place of their account. demoSignIn writes the
  // new token pair through applySessionAtom, whose identity-switch detection clears the prior user's
  // workspace — so the demo replaces their session only on success. If it fails (e.g. the server
  // demo is off), their real session is left untouched; the error view's back link returns them to it.
  const confirmSwitch = async () => {
    startedRef.current = true
    setSwitching(true)
    setError('')
    const res = await demoSignIn()
    if (res.ok) navigate('/overview')
    else {
      setError(res.error)
      setSwitching(false)
    }
  }

  if (error) {
    return (
      <AuthShell>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h1 className="text-lg font-medium tracking-tight mb-1">Demo unavailable</h1>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <button
            type="button"
            onClick={() => navigate(authenticated ? '/overview' : '/')}
            className="text-link text-sm font-medium hover:underline underline-offset-4"
          >
            {authenticated ? 'Back to my dashboard' : 'Back to sign in'}
          </button>
        </div>
      </AuthShell>
    )
  }

  // Real user signed in to their own account — confirm before replacing their session.
  if (authenticated && !isDemo) {
    return (
      <AuthShell>
        <h1 className="text-2xl font-medium tracking-tight">View the live demo?</h1>
        <p className="text-sm text-muted-foreground mt-1.5 mb-6">
          You're signed in. Viewing the read-only demo will sign you out of your account on this device.
        </p>
        <Button className="w-full" onClick={confirmSwitch} disabled={switching}>
          {switching && <Loader2 className="animate-spin" />}
          View read-only demo
        </Button>
        <button
          type="button"
          onClick={() => navigate('/overview')}
          disabled={switching}
          className="text-link font-medium text-sm hover:underline underline-offset-4 mt-6 disabled:opacity-50"
        >
          Back to my dashboard
        </button>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Starting the demo…</span>
      </div>
    </AuthShell>
  )
}

export default Demo
