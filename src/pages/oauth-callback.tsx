import { useSetAtom } from 'jotai'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { completeGoogleOAuthAtom } from '@/auth/auth.atoms'
import { AuthShell } from '@/auth/auth-shell'
import { googleOAuthRedirectError } from '@/auth/oauth'

const OAuthCallback = () => {
  const params = new URLSearchParams(window.location.search)
  const googleError = params.get('error')
  const googleErrorDescription = params.get('error_description')
  const code = params.get('code') ?? ''
  const state = params.get('state') ?? ''
  const completeGoogleOAuth = useSetAtom(completeGoogleOAuthAtom)
  const [, navigate] = useLocation()
  const [error, setError] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    if (googleError || !code || !state) return
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      const res = await completeGoogleOAuth({ code, state })
      if (res.ok) navigate('/overview')
      else setError(res.error)
    })()
  }, [googleError, code, state, completeGoogleOAuth, navigate])

  if (googleError) {
    return (
      <AuthShell>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h1 className="text-lg font-semibold tracking-tight mb-1">Couldn't sign you in</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {googleOAuthRedirectError(googleError, googleErrorDescription)}
          </p>
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

  if (!code || !state) {
    return (
      <AuthShell>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h1 className="text-lg font-semibold tracking-tight mb-1">Invalid callback</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This sign-in callback is incomplete. Start again from the sign-in page.
          </p>
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

  if (error) {
    return (
      <AuthShell>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h1 className="text-lg font-semibold tracking-tight mb-1">Couldn't sign you in</h1>
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

export default OAuthCallback
