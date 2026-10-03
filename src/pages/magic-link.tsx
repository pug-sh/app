import { useSetAtom } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import type { SSORequired } from '@/api/genproto/public/auth/v1/auth_pb'
import { completeMagicLinkAtom } from '@/auth/auth.atoms'
import { AuthPending, AuthStatus } from '@/auth/auth-status'
import { SSORequiredScreen } from '@/auth/sso-required-screen'

const MagicLink = () => {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const completeMagicLink = useSetAtom(completeMagicLinkAtom)
  const [, navigate] = useLocation()
  const [error, setError] = useState('')
  const [ssoRequired, setSSORequired] = useState<SSORequired | null>(null)
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
      else if (res.ssoRequired) setSSORequired(res.ssoRequired)
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

  // The server left the link unused, so an invite is accepted by the SSO sign-in instead.
  if (ssoRequired) {
    let description = `Email links are turned off for ${ssoRequired.domain}.`
    if (ssoRequired.invite) description = 'Sign in to accept your invite.'
    return (
      <SSORequiredScreen
        detail={ssoRequired}
        description={description}
        inviteToken={ssoRequired.invite ? token : undefined}
        onUseDifferentEmail={() => navigate('/')}
      />
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
