import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { AuthProviderType } from '@/api/genproto/public/auth/v1/auth_pb'
import { authProvidersAtom, completeOIDCAtom } from '@/auth/auth.atoms'
import { AuthPending, AuthStatus } from '@/auth/auth-status'
import { clearPendingOIDCProvider, completeOIDCRedirect, pendingOIDCProviderID } from '@/auth/oidc'

const OAuthCallback = () => {
  const providers = useAtomValue(authProvidersAtom)
  const completeOIDC = useSetAtom(completeOIDCAtom)
  const [, navigate] = useLocation()
  const started = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (started.current) return
    started.current = true

    const providerId = pendingOIDCProviderID()
    if (!providers) {
      setError('Sign-in options could not be loaded. Try again.')
      return
    }
    const provider = providers.find(
      candidate => candidate.id === providerId && candidate.type === AuthProviderType.OIDC,
    )
    if (!provider) {
      clearPendingOIDCProvider()
      setError('This sign-in request is no longer available. Start again from the sign-in page.')
      return
    }

    void (async () => {
      try {
        const authorization = await completeOIDCRedirect(provider)
        const result = await completeOIDC({ provider, ...authorization })
        if (!result.ok) {
          setError(result.error)
          return
        }
        navigate('/', { replace: true })
      } catch (callbackError) {
        console.error('OIDC callback failed', callbackError)
        setError(`${provider.displayName} sign-in could not be completed. Try again.`)
      }
    })()
  }, [completeOIDC, navigate, providers])

  if (!error) return <AuthPending label="Completing secure sign-in…" />

  return (
    <AuthStatus icon={AlertCircle} tone="negative" title="Sign-in failed" description={error}>
      <button
        type="button"
        className="mt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
        onClick={() => navigate('/', { replace: true })}
      >
        Back to sign in
      </button>
    </AuthStatus>
  )
}

export default OAuthCallback
