import { KeyRound, Loader2 } from 'lucide-react'
import type { AuthProviderConfig } from '@/api/genproto/public/auth/v1/auth_pb'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { startOIDCSignIn } from './oidc'

// Google's sign-in branding fixes these values, so they're literals rather than theme tokens.
// Only the radius follows the app — Google's 4px was already overridden for the old GIS button.
const googleBranding =
  'border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f2f2f2] dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1e1f20]'

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
  // Keyed on the issuer, not the id — the id is operator-chosen and can be anything.
  const isGoogle = provider.issuerUrl.startsWith('https://accounts.google.com')

  const begin = async () => {
    onBegin()
    try {
      await startOIDCSignIn(provider)
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
    <Button
      type="button"
      variant="outline"
      className={cn('h-10 w-full', isGoogle && googleBranding)}
      disabled={disabled || loading}
      onClick={begin}
    >
      {loading ? <Loader2 className="animate-spin" /> : mark}
      Continue with {provider.displayName}
    </Button>
  )
}
