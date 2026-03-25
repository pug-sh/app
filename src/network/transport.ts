import { ConnectError, type Interceptor } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { createValidator } from '@bufbuild/protovalidate'
import { atom } from 'jotai'

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
    // atomWithStorage wraps the value in JSON, so it's stored as a quoted string
    const jwt = JSON.parse(token) as string
    if (jwt) {
      req.header.set('authorization', `Bearer ${jwt}`)
    }
  }
  return next(req)
}

export const transportAtom = atom(() => {
  return createConnectTransport({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    interceptors: [authBearer, protovalidate],
  })
})
