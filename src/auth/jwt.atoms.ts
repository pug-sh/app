import { atom, getDefaultStore } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { isDemoSessionAtom } from './demo'

// Shared with transport.ts — both read the same localStorage keys.
export const JWT_KEY = 'pug:jwt'
// The long-lived refresh token. The access JWT (JWT_KEY) is short-lived (~24h);
// the refresh token is exchanged for a fresh pair via AuthService.RefreshSession.
export const REFRESH_KEY = 'pug:refresh'

// Read a token straight from localStorage, bypassing the Jotai store. Two callers,
// both of which need to skip the store deliberately: seeding the atoms below at
// module load, so the first render already knows the auth state (no sign-in flash);
// and transport.ts's cross-tab refresh lock, where localStorage is the ONLY place
// another tab's rotation is visible. atomWithStorage JSON-serializes, so the raw
// value is e.g. '"abc..."'.
export const readStored = (key: string): string => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as string) : ''
  } catch (err) {
    console.error(`Failed to read stored ${key}:`, err)
    return ''
  }
}

export const jwtAtom = atomWithStorage(JWT_KEY, readStored(JWT_KEY))
export const refreshTokenAtom = atomWithStorage(REFRESH_KEY, readStored(REFRESH_KEY))

interface JWTPayload {
  exp: number
  iss: string
  jti: string
  sub: string
}

export const readJWT = (token: string) => {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('invalid jwt')
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const data = JSON.parse(atob(b64))
  if (typeof data.exp !== 'number' || typeof data.sub !== 'string') throw new Error('invalid jwt payload')
  return data as JWTPayload
}

export const jwtDataAtom = atom(get => {
  const jwt = get(jwtAtom)
  if (!jwt) return undefined
  try {
    const data = readJWT(jwt)
    return { exp: data.exp, customerId: data.sub }
  } catch (err) {
    console.error('JWT parse failed:', err)
    return undefined
  }
})

// Persist a freshly issued token pair from outside React (transport refresh) or
// inside it (sign-in atoms). Uses the default Jotai store so all subscribers
// re-render and atomWithStorage syncs localStorage automatically.
export const setSessionTokens = ({ accessToken, refreshToken }: { accessToken: string; refreshToken: string }) => {
  const store = getDefaultStore()
  store.set(jwtAtom, accessToken)
  store.set(refreshTokenAtom, refreshToken)
}

// Clear the whole session (both tokens + the demo marker). Called when a refresh ultimately fails
// or on explicit sign-out — the demo marker must die with the session so it can't bleed into the
// next login (parity with signOutAtom / applySessionAtom).
export const clearSession = () => {
  const store = getDefaultStore()
  store.set(jwtAtom, '')
  store.set(refreshTokenAtom, '')
  store.set(isDemoSessionAtom, false)
}
