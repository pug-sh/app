import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export const jwtAtom = atomWithStorage('cotton:jwt', '')

interface JWTPayload {
  exp: number
  iss: string
  jti: string
  sub: string
}

export const readJWT = (token: string): JWTPayload => {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('invalid jwt')
  return JSON.parse(atob(parts[1])) as JWTPayload
}

export const jwtDataAtom = atom(get => {
  const jwt = get(jwtAtom)
  if (!jwt) return undefined
  try {
    const data = readJWT(jwt)
    return { exp: data.exp, customerId: data.sub }
  } catch {
    return undefined
  }
})

export const signOutAtom = atom(null, (_, set) => set(jwtAtom, ''))
