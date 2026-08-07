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
  onLoadingChange,
  onError,
}: {
  disabled: boolean
  onBegin?: () => void
  onLoadingChange?: (loading: boolean) => void
  onError: (message: string) => void
}) => {
  const completeGoogleOAuth = useSetAtom(completeGoogleOAuthAtom)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [buttonWidth, setButtonWidth] = useState(defaultButtonWidth)

  // The container below renders unconditionally — only its child swaps — so the node this
  // observes outlives every busy cycle. Layout-phase so the button never flashes at 384px.
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

  const setBusy = (next: boolean) => {
    setLoading(next)
    onLoadingChange?.(next)
  }

  const handleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      console.error('Google sign-in returned no credential')
      onError('Google sign-in could not be completed. Try again.')
      return
    }
    setBusy(true)
    try {
      const result = await completeGoogleOAuth({ credential: response.credential })
      if (!result.ok) onError(result.error)
    } catch (err) {
      console.error('google oauth complete failed', err)
      onError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // No clip on this container — GIS clamps its own width to [200, 400], so a narrower container
  // shaves the button's corners and outline. The radius goes on the button itself, in index.css.
  return (
    <div ref={containerRef} className="google-signin-button min-h-10 w-full">
      {disabled || loading ? (
        <button
          type="button"
          disabled
          aria-busy={loading}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-input bg-background text-sm text-muted-foreground opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Continue with Google
        </button>
      ) : (
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => {
            console.error('Google Identity Services reported a sign-in error')
            onError('Google sign-in failed. Try again.')
          }}
          click_listener={onBegin}
          // Light in both modes on purpose: GIS's two filled themes (filled_black, filled_blue)
          // both back the G with a hard white tile, which reads worse than the white button.
          theme="outline"
          size="large"
          text="continue_with"
          logo_alignment="center"
          width={buttonWidth}
        />
      )}
    </div>
  )
}
