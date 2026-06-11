import { GoogleOAuthProvider } from '@react-oauth/google'
import type { ReactNode } from 'react'
import { googleClientId } from './oauth'

export const AppGoogleOAuthProvider = ({ children }: { children: ReactNode }) => {
  const clientId = googleClientId()
  if (!clientId) return children
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
}
