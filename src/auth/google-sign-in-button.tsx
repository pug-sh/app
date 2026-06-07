import { type CredentialResponse, GoogleLogin } from '@react-oauth/google'
import { useSetAtom } from 'jotai'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { completeGoogleOAuthAtom } from '@/auth/auth.atoms'

// Sign-in form uses max-w-sm (384px); avoids a blank frame before ResizeObserver runs.
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

  useEffect(() => {
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
      <div className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input bg-background text-sm text-muted-foreground opacity-50">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Continue with Google
      </div>
    )
  }

  return (
    <div ref={containerRef} className="min-h-10 w-full">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => onError('Google sign-in failed. Try again.')}
        click_listener={onBegin}
        theme="outline"
        size="large"
        text="continue_with"
        width={buttonWidth}
      />
    </div>
  )
}
