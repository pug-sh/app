import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AuthProviderType, type SSORequired } from '@/api/genproto/public/auth/v1/auth_pb'
import { AuthStatus } from './auth-status'
import { isGoogleProvider } from './oidc'
import { OIDCSignInButton } from './oidc-sign-in-button'

const orList = new Intl.ListFormat('en', { type: 'disjunction' })

// For a sign-in that went through a provider but didn't prove the domain, e.g. a personal Google
// account using a work address.
export const wrongAccountHint = (detail: SSORequired) => {
  if (detail.providers.some(isGoogleProvider)) return `Use your ${detail.domain} Google Workspace account.`
  return `Use your ${detail.domain} account.`
}

export const SSORequiredScreen = ({
  detail,
  description,
  email,
  inviteToken,
  onUseDifferentEmail,
}: {
  detail: SSORequired
  description?: string
  email?: string
  inviteToken?: string
  onUseDifferentEmail: () => void
}) => {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')

  // A provider redirect leaves `pending` set, and bfcache restores the page that way on Back.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const providers = detail.providers.filter(provider => provider.type === AuthProviderType.OIDC)
  const names = providers.map(provider => provider.displayName)
  return (
    <AuthStatus
      icon={ShieldCheck}
      title={`${detail.domain} accounts sign in with ${names.length > 0 ? orList.format(names) : 'SSO'}`}
      description={names.length > 0 ? description : 'Ask your administrator how to sign in.'}
    >
      <div className="mt-6 space-y-2">
        {providers.map(provider => (
          <OIDCSignInButton
            key={provider.id}
            provider={provider}
            options={{ loginHint: email, domain: detail.domain, inviteToken }}
            disabled={pending !== null}
            loading={pending === provider.id}
            onBegin={() => {
              setError('')
              setPending(provider.id)
            }}
            onError={message => {
              setPending(null)
              setError(message)
            }}
          />
        ))}
      </div>
      {error && <p className="mt-4 rounded-md bg-destructive/5 px-3 py-2 text-sm text-negative">{error}</p>}
      <button
        type="button"
        className="mt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
        onClick={onUseDifferentEmail}
      >
        Use a different email
      </button>
    </AuthStatus>
  )
}
