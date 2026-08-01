import { useSetAtom } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { completeMagicLinkAtom } from '@/auth/auth.atoms'
import { AuthPending, AuthStatus } from '@/auth/auth-status'

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

  const backToSignIn = (
    <button
      type="button"
      onClick={() => navigate('/')}
      className="mt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
    >
      Back to sign in
    </button>
  )

  if (!token) {
    return (
      <AuthStatus
        icon={AlertCircle}
        tone="negative"
        title="Invalid link"
        description="This link is missing its token. Request a new one."
      >
        {backToSignIn}
      </AuthStatus>
    )
  }

  if (error) {
    return (
      <AuthStatus icon={AlertCircle} tone="negative" title="Couldn't sign you in" description={error}>
        {backToSignIn}
      </AuthStatus>
    )
  }

  return <AuthPending label="Signing you in…" />
}

export default MagicLink
