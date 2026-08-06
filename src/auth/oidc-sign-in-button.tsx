import { KeyRound, Loader2 } from 'lucide-react'
import type { AuthProviderConfig } from '@/api/genproto/public/auth/v1/auth_pb'
import { Button } from '@/components/ui/button'
import { startOIDCSignIn } from './oidc'

export const OIDCSignInButton = ({
  provider,
  disabled,
  loading,
  onBegin,
  onError,
}: {
  provider: AuthProviderConfig
  disabled: boolean
  loading: boolean
  onBegin: () => void
  onError: (message: string) => void
}) => {
  const begin = async () => {
    onBegin()
    try {
      await startOIDCSignIn(provider)
    } catch (error) {
      console.error('OIDC sign-in redirect failed', error)
      onError(`${provider.displayName} sign-in could not be started. Try again.`)
    }
  }

  return (
    <Button type="button" variant="outline" className="h-10 w-full" disabled={disabled} onClick={begin}>
      {loading ? <Loader2 className="animate-spin" /> : <KeyRound aria-hidden />}
      Continue with {provider.displayName}
    </Button>
  )
}
