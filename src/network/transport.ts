import { Code, ConnectError, type Interceptor } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { createValidator } from '@bufbuild/protovalidate'
import { clearJwt, JWT_KEY } from '@/auth/jwt.atoms'
import { atom } from 'jotai'
import { toast } from 'sonner'

const validator = createValidator()

const protovalidate: Interceptor = next => async req => {
  if (!req.stream) {
    const result = validator.validate(req.method.input, req.message)
    if (result.kind === 'invalid') {
      throw new ConnectError(result.violations.map(v => `${v.field}: ${v.message}`).join('; '))
    }
    if (result.kind === 'error') {
      console.error('Proto validation error:', result.error)
    }
  }
  return next(req)
}

const authBearer: Interceptor = next => async req => {
  const token = localStorage.getItem(JWT_KEY)
  if (token) {
    // Reads localStorage directly because interceptors run outside React.
    // atomWithStorage JSON-serializes values, so the raw value is e.g. '"abc..."'.
    try {
      const jwt = JSON.parse(token) as string
      if (jwt) {
        req.header.set('authorization', `Bearer ${jwt}`)
      }
    } catch (err) {
      console.error('Failed to parse JWT from localStorage, resetting:', err)
      clearJwt()
    }
  }
  try {
    return await next(req)
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
      clearJwt()
      toast.error('Session expired — please sign in again')
    }
    throw err
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
if (!apiBaseUrl) {
  throw new Error('VITE_API_BASE_URL is not configured. Check your .env file.')
}

export const transportAtom = atom(() => {
  return createConnectTransport({
    baseUrl: apiBaseUrl,
    interceptors: [authBearer, protovalidate],
  })
})
