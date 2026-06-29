import { useAtomValue, useSetAtom } from 'jotai'
import { useLocation } from 'wouter'
import { signOutAtom } from '@/auth/auth.atoms'
import { isDemoSessionAtom } from '@/auth/demo'

// Slim top-of-app bar shown only during a read-only demo session. The CTA converts the visitor:
// sign out of the demo (which clears the marker) and land on the sign-in page, which doubles as
// sign-up (magic link creates the account on first use).
export const DemoBanner = () => {
  const isDemo = useAtomValue(isDemoSessionAtom)
  const signOut = useSetAtom(signOutAtom)
  const [, navigate] = useLocation()

  if (!isDemo) return null

  const signUp = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 border-b border-border bg-muted/40 px-4 py-1.5 text-center text-xs">
      <span className="text-muted-foreground">You're exploring a live, read-only demo of Pug.</span>
      <button
        type="button"
        onClick={signUp}
        className="cursor-pointer font-medium text-link underline-offset-4 hover:underline"
      >
        Sign up free →
      </button>
    </div>
  )
}
