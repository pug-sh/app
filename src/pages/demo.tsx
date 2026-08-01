import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, Eye, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { demoSignInAtom, isAuthenticatedAtom } from '@/auth/auth.atoms'
import { AuthPending, AuthStatus } from '@/auth/auth-status'
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
      <AuthStatus icon={AlertCircle} tone="negative" title="Demo unavailable" description={error}>
        <button
          type="button"
          onClick={() => navigate(authenticated ? '/overview' : '/')}
          className="mt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          {authenticated ? 'Back to my dashboard' : 'Back to sign in'}
        </button>
      </AuthStatus>
    )
  }

  // Real user signed in to their own account — confirm before replacing their session.
  if (authenticated && !isDemo) {
    return (
      <AuthStatus
        icon={Eye}
        title="View the live demo?"
        description="You're signed in. Viewing the read-only demo will sign you out of your account on this device."
      >
        <div className="mt-6 flex flex-col gap-6">
          <Button className="h-10 w-full" onClick={confirmSwitch} disabled={switching}>
            {switching && <Loader2 className="animate-spin" />}
            View read-only demo
          </Button>
          <button
            type="button"
            onClick={() => navigate('/overview')}
            disabled={switching}
            className="text-sm font-medium text-link underline-offset-4 hover:underline disabled:opacity-50"
          >
            Back to my dashboard
          </button>
        </div>
      </AuthStatus>
    )
  }

  return <AuthPending label="Starting the demo…" />
}

export default Demo
