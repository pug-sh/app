import { type CredentialResponse, GoogleLogin } from '@react-oauth/google'
import { useSetAtom } from 'jotai'
import { Loader2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { completeGoogleOAuthAtom } from '@/auth/auth.atoms'

// First-render fallback until the layout effect measures the container. max-w-sm (384px)
// is the widest the sign-in form ever gets, so on desktop this is already correct.
const defaultButtonWidth = 384

export const GoogleSignInButton = ({
  disabled,
  onBegin,
  onError,
}: {
  disabled: boolean
  onBegin?: () => void
  onError: (message: string) => void
}) => {
  const completeGoogleOAuth = useSetAtom(completeGoogleOAuthAtom)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [buttonWidth, setButtonWidth] = useState(defaultButtonWidth)

  // Measure in a layout effect (before paint) so the GIS button never flashes at the 384px
  // default on narrow screens; the ResizeObserver keeps it in sync on later resizes.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      if (el.offsetWidth > 0) setButtonWidth(el.offsetWidth)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      console.error('Google sign-in returned no credential')
      onError('Google sign-in could not be completed. Try again.')
      return
    }
    setLoading(true)
    try {
      const result = await completeGoogleOAuth({ credential: response.credential })
      if (!result.ok) onError(result.error)
    } catch (err) {
      console.error('google oauth complete failed', err)
      onError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const busy = disabled || loading

  if (busy) {
    return (
      <div className="flex h-10 w-full items-center justify-center gap-2 rounded border border-input bg-background text-sm text-muted-foreground opacity-50">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Continue with Google
      </div>
    )
  }

  // No overflow clip here: the GIS button renders at buttonWidth, and the column's min-w-0
  // (in sign-in.tsx) lets it track the viewport, so the button can't force page overflow.
  // Leaving it un-clipped keeps the button's own rounded corners + outline border intact —
  // an overflow-hidden clip on the container shaved the button's right corners in responsive mode.
  return (
    <div ref={containerRef} className="min-h-10 w-full">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => {
          console.error('Google Identity Services reported a sign-in error')
          onError('Google sign-in failed. Try again.')
        }}
        click_listener={onBegin}
        theme="outline"
        size="large"
        text="continue_with"
        width={buttonWidth}
      />
    </div>
  )
}
