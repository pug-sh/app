import { Code, ConnectError, type Interceptor } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { createValidator } from '@bufbuild/protovalidate'
import { atom } from 'jotai'
import { toast } from 'sonner'

const validator = createValidator()

const protovalidate: Interceptor = next => async req => {
  if (!req.stream) {
    const result = validator.validate(req.method.input, req.message)
    if (result.kind === 'invalid') {
      throw new ConnectError(result.violations.map(v => `${v.field}: ${v.message}`).join('; '))
    }
  }
  return next(req)
}

const JWT_STORAGE_KEY = 'cotton:jwt'

const authBearer: Interceptor = next => async req => {
  const token = localStorage.getItem(JWT_STORAGE_KEY)
  if (token) {
    // The interceptor reads localStorage directly because interceptors run outside Jotai's store context.
    // atomWithStorage serializes values as JSON, so the raw localStorage entry is a JSON-quoted string.
    try {
      const jwt = JSON.parse(token) as string
      if (jwt) {
        req.header.set('authorization', `Bearer ${jwt}`)
      }
    } catch {
      localStorage.setItem(JWT_STORAGE_KEY, JSON.stringify(''))
    }
  }
  try {
    return await next(req)
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
      localStorage.setItem(JWT_STORAGE_KEY, JSON.stringify(''))
      toast.error('Session expired — please sign in again')
    }
    throw err
  }
}

export const transportAtom = atom(() => {
  return createConnectTransport({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    interceptors: [authBearer, protovalidate],
  })
})
