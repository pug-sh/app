import { atom, getDefaultStore } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

// Shared with transport.ts — both read the same localStorage key
export const JWT_KEY = 'cotton:jwt'

// Read synchronously so the first render already knows the auth state (no sign-in flash)
const storedJwt = (() => {
  try {
    const raw = localStorage.getItem(JWT_KEY)
    return raw ? (JSON.parse(raw) as string) : ''
  } catch (err) {
    console.error('Failed to read stored JWT:', err)
    return ''
  }
})()

export const jwtAtom = atomWithStorage(JWT_KEY, storedJwt)

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

export const signOutAtom = atom(null, (_, set) => set(jwtAtom, ''))

// Clear JWT from outside React (e.g. interceptors). Uses the default Jotai store
// so all subscribers re-render and atomWithStorage syncs localStorage automatically.
export const clearJwt = () => getDefaultStore().set(jwtAtom, '')
