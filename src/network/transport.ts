import { createRegistry } from '@bufbuild/protobuf'
import { createValidator } from '@bufbuild/protovalidate'
import { Code, ConnectError, createClient, type Interceptor } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { atom, getDefaultStore } from 'jotai'
import { toast } from 'sonner'
import { file_common_v1_filters } from '@/api/genproto/common/v1/filters_pb'
import { AuthService } from '@/api/genproto/public/auth/v1/auth_pb'
import { file_shared_insights_v1_insights } from '@/api/genproto/shared/insights/v1/insights_pb'
import {
  clearSession,
  JWT_KEY,
  jwtAtom,
  REFRESH_KEY,
  readJWT,
  refreshTokenAtom,
  setSessionTokens,
} from '@/auth/jwt.atoms'

// Register the app's file descriptors so the validator can compile rules defined
// in these protos (e.g. buf.validate constraints on PropertyFilter which references
// common.v1.FilterOperator).
const validator = createValidator({
  registry: createRegistry(file_common_v1_filters, file_shared_insights_v1_insights),
})

const protovalidate: Interceptor = next => async req => {
  if (!req.stream) {
    const result = validator.validate(req.method.input, req.message)
    if (result.kind === 'invalid') {
      throw new ConnectError(result.violations.map(v => `${v.field}: ${v.message}`).join('; '))
    }
    if (result.kind === 'error') {
      throw new ConnectError(`Proto validation error: ${result.error}`)
    }
  }
  return next(req)
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
if (!apiBaseUrl) {
  throw new Error('VITE_API_BASE_URL is not configured. Check your .env file.')
}

const store = getDefaultStore()

// Read a token from the Jotai store, falling back to localStorage for the first
// request before atomWithStorage hydrates. atomWithStorage JSON-serializes values,
// so the raw localStorage value is e.g. '"abc..."'.
const readToken = (atomRef: typeof jwtAtom, key: string): string => {
  const inMemory = store.get(atomRef)
  if (inMemory) return inMemory
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as string) : ''
  } catch {
    return ''
  }
}

const getAccessToken = () => readToken(jwtAtom, JWT_KEY)
const getRefreshToken = () => readToken(refreshTokenAtom, REFRESH_KEY)

// Treat a token within 15s of expiry as expired (clock-skew leeway) so we refresh
// just before, not just after, the server would reject it. Unparseable → expired.
const accessTokenExpired = (token: string): boolean => {
  try {
    return readJWT(token).exp * 1000 <= Date.now() + 15_000
  } catch {
    return true
  }
}

// Dedicated client for RefreshSession — deliberately WITHOUT authBearer so a
// refresh call can't recurse into the refresh logic.
const refreshClient = createClient(
  AuthService,
  createConnectTransport({ baseUrl: apiBaseUrl, interceptors: [protovalidate] }),
)

// Single-flight: concurrent requests that all see an expired token share ONE
// refresh call. Critical for reuse-detection — firing two RefreshSession calls
// with the same refresh token would trip the server's family revocation and log
// the user out. The promise is cleared once settled so the next window refreshes.
let refreshInFlight: Promise<string | null> | null = null

const refreshAccessToken = (): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

// doRefresh is the SOLE authority on session death. It clears the session ONLY
// when RefreshSession returns Unauthenticated — i.e. the server authoritatively
// rejected the refresh token (expired / revoked / reused). Every other failure
// (offline, 5xx during a deploy, timeout) is transient: the refresh token is
// almost certainly still valid, so we keep the session and return null, letting
// the caller's request fail normally and retry later. Conflating the two would
// log active users out on infrastructure noise — the exact failure this whole
// feature exists to avoid.
const doRefresh = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
  try {
    const resp = await refreshClient.refreshSession({ refreshToken })
    setSessionTokens({ accessToken: resp.token, refreshToken: resp.refreshToken })
    return resp.token
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
      clearSession()
      toast.error('Session expired — please sign in again')
      return null
    }
    // Transient — keep the session intact.
    console.error('token refresh failed (transient); keeping session', err)
    return null
  }
}

const authBearer: Interceptor = next => async req => {
  let token = getAccessToken()
  // Proactively refresh an expired/missing access token while a refresh token
  // exists, so the first request after the access window doesn't have to 401 first.
  if ((!token || accessTokenExpired(token)) && getRefreshToken()) {
    token = (await refreshAccessToken()) ?? ''
    if (!token) {
      // doRefresh already cleared the session (authoritative) or kept it (transient).
      // Either way there's no usable access token, so don't send a doomed request.
      throw new ConnectError('not authenticated', Code.Unauthenticated)
    }
  }
  if (token) {
    req.header.set('authorization', `Bearer ${token}`)
  }

  try {
    return await next(req)
  } catch (err) {
    if (!(err instanceof ConnectError) || err.code !== Code.Unauthenticated || req.stream) {
      throw err
    }
    // A 401 here could mean the access token was revoked before its own expiry —
    // try ONE refresh+retry. It could equally be an AUTHORIZATION failure (e.g. a
    // forbidden x-project-id), which the backend also returns as Unauthenticated.
    // So we never clear the session based on this business-endpoint 401: session
    // death is decided only inside doRefresh. If the retry still 401s, that's
    // authorization, not an expired session — let it propagate untouched.
    if (!getRefreshToken()) throw err
    const fresh = await refreshAccessToken()
    if (!fresh) throw err
    req.header.set('authorization', `Bearer ${fresh}`)
    return await next(req)
  }
}

export const transportAtom = atom(() => {
  return createConnectTransport({
    baseUrl: apiBaseUrl,
    interceptors: [authBearer, protovalidate],
  })
})
