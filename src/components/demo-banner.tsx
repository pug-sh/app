import { useAtomValue, useSetAtom } from 'jotai'
import { signOutAtom } from '@/auth/auth.atoms'
import { appOrigin, isDemoHost, isDemoSessionAtom } from '@/auth/demo'

// Shown only in a demo session. Its CTA links to the app's origin, or signs out to the sign-in page (which doubles as
// sign-up) in a demo session the app's origin still holds from before the demo had its own.
export const DemoBanner = () => {
  const isDemo = useAtomValue(isDemoSessionAtom)
  const signOut = useSetAtom(signOutAtom)

  if (!isDemo) return null

  const ctaClass = 'font-medium text-link underline-offset-4 hover:underline'
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 border-b border-border bg-muted/40 px-page-gutter py-1.5 text-center text-xs">
      <span className="text-muted-foreground">You're exploring a live, read-only demo of Pug.</span>
      {isDemoHost() ? (
        <a href={appOrigin()} className={ctaClass}>
          Sign up free →
        </a>
      ) : (
        // Dropping the /p/:projectId URL is App's job, not this button's: see SessionUrlGuard.
        <button type="button" onClick={() => signOut()} className={ctaClass}>
          Sign up free →
        </button>
      )}
    </div>
  )
}
