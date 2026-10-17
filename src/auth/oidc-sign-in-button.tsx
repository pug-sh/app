import { KeyRound, Loader2 } from 'lucide-react'
import type { AuthProviderConfig } from '@/api/genproto/public/auth/v1/auth_pb'
import { Button } from '@/components/ui/button'
import { isGoogleProvider, type OIDCSignInOptions, startOIDCSignIn } from './oidc'

export const OIDCSignInButton = ({
  provider,
  options,
  disabled,
  loading,
  onBegin,
  onError,
}: {
  provider: AuthProviderConfig
  options?: OIDCSignInOptions
  disabled: boolean
  loading: boolean
  onBegin: () => void
  onError: (message: string) => void
}) => {
  const isGoogle = isGoogleProvider(provider)

  const begin = async () => {
    onBegin()
    try {
      await startOIDCSignIn(provider, options)
    } catch (error) {
      console.error('OIDC sign-in redirect failed', error)
      onError(`${provider.displayName} sign-in could not be started. Try again.`)
    }
  }

  const mark = isGoogle ? (
    <img src="/google.svg" alt="" aria-hidden className="size-[18px]" />
  ) : (
    <KeyRound aria-hidden />
  )

  return (
    <Button type="button" variant="outline" className="h-10 w-full" disabled={disabled || loading} onClick={begin}>
      {loading ? <Loader2 className="animate-spin" /> : mark}
      Continue with {provider.displayName}
    </Button>
  )
}
