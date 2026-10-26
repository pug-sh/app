import { useSetAtom } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { demoSignInAtom } from '@/auth/auth.atoms'
import { AuthPending, AuthStatus } from '@/auth/auth-status'
import { demoHandoffUrl } from '@/auth/demo'

// The app's /demo hands off to the demo's own origin, which signs any signed-out visitor in as the demo viewer, on
// whatever page they opened.
const Demo = () => {
  const demoSignIn = useSetAtom(demoSignInAtom)
  const [error, setError] = useState('')
  // StrictMode runs the effect twice, and each run would mint a session.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const handoff = demoHandoffUrl()
    if (handoff) {
      window.location.replace(handoff)
      return
    }
    ;(async () => {
      const res = await demoSignIn()
      if (!res.ok) setError(res.error)
    })()
  }, [demoSignIn])

  if (error) {
    return (
      <AuthStatus icon={AlertCircle} tone="negative" title="Demo unavailable" description={error}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          Try again
        </button>
      </AuthStatus>
    )
  }

  return <AuthPending label="Starting the demo…" />
}

export default Demo
