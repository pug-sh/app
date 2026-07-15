import { createRegistry } from '@bufbuild/protobuf'
import { createValidator } from '@bufbuild/protovalidate'
import { Code, ConnectError, createClient, type Interceptor } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { atom, getDefaultStore } from 'jotai'
import { toast } from 'sonner'
import { file_common_v1_filters } from '@/api/genproto/common/v1/filters_pb'
import { AuthService } from '@/api/genproto/public/auth/v1/auth_pb'
import { file_public_dashboards_v1_dashboards } from '@/api/genproto/public/dashboards/v1/dashboards_pb'
import { file_shared_insights_v1_insights } from '@/api/genproto/shared/insights/v1/insights_pb'
import {
  clearSession,
  JWT_KEY,
  jwtAtom,
  REFRESH_KEY,
  readJWT,
  readStored,
  refreshTokenAtom,
  setSessionTokens,
} from '@/auth/jwt.atoms'

// Register the app's file descriptors so the validator can compile rules defined
// in these protos (e.g. buf.validate constraints on PropertyFilter which references
// common.v1.FilterOperator).
const validator = createValidator({
  registry: createRegistry(
    file_common_v1_filters,
    file_shared_insights_v1_insights,
    file_public_dashboards_v1_dashboards,
  ),
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
// request before atomWithStorage hydrates.
const readToken = (atomRef: typeof jwtAtom, key: string): string => store.get(atomRef) || readStored(key)

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

// Refresh must be single-flight, because the server CONSUMES the presented refresh
// token on rotation: a second call with the same token is, to the server, a replay,
// and it responds by revoking the entire family — hard-logging the user out
// everywhere. Two layers enforce that, and both are needed:
//
// 1. refreshInFlight (here) coalesces concurrent requests within ONE tab.
// 2. withRefreshLock (below) serializes tabs against each other.
//
// This layer is module-scoped, so it is blind to other tabs. It is kept anyway
// because it is the cheap path — it collapses a burst of parallel requests into a
// single lock acquisition. The promise is cleared once settled so the next window
// refreshes.
let refreshInFlight: Promise<string | null> | null = null

// presentedRefresh is the refresh token the caller was about to spend. It is only a
// hint for the coalesced call: when a refresh is already in flight the first
// caller's value wins, which is correct because every caller reads it from the same
// storage a moment apart.
const refreshAccessToken = (presentedRefresh: string): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh(presentedRefresh).finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

// Every tab shares ONE localStorage refresh token, so tabs waking from the same
// expiry window would each present it and all but the winner would trip the
// reuse-detection described above. Web Locks are origin-scoped, so they queue tabs
// where a module-scoped promise cannot see them.
//
// The API needs a secure context; where it is absent (plain-HTTP origin, jsdom) fall
// back to in-tab-only serialization rather than crash — that is exactly the behavior
// this replaces, so degrading costs nothing that was already working.
const REFRESH_LOCK = 'pug:refresh-lock'

const withRefreshLock = <T>(fn: () => Promise<T>): Promise<T> =>
  navigator.locks ? (navigator.locks.request(REFRESH_LOCK, fn) as Promise<T>) : fn()

// doRefresh is the SOLE authority on session death. It clears the session ONLY
// when RefreshSession returns Unauthenticated — i.e. the server authoritatively
// rejected the refresh token (expired / revoked / reused). Every other failure
// (offline, 5xx during a deploy, timeout) is transient: the refresh token is
// almost certainly still valid, so we keep the session and return null, letting
// the caller's request fail normally and retry later. Conflating the two would
// log active users out on infrastructure noise — the exact failure this whole
// feature exists to avoid.
const doRefresh = (presentedRefresh: string): Promise<string | null> =>
  withRefreshLock(async () => {
    // Re-read now that the lock is held. This must bypass the Jotai store: jwtAtom is
    // unmounted on nearly every page, so it never receives the storage event carrying
    // another tab's write. localStorage is the only place a rotation is visible.
    const storedRefresh = readStored(REFRESH_KEY)
    // Empty means another tab cleared the session (sign-out, or its own refresh was
    // authoritatively rejected). Nothing to present.
    if (!storedRefresh) return null

    // A refresh token that changed under us means another tab rotated the family
    // while we queued, so presentedRefresh is now consumed — presenting it is
    // precisely the replay that revokes the family. Adopt the winner's access token
    // instead. Note the test is rotation, NOT access-token expiry: on the 401 retry
    // path below the access token is unexpired and still rejected (revoked ahead of
    // its exp), and keying off expiry there would hand back the very token the
    // server just refused and skip the refresh entirely.
    if (storedRefresh !== presentedRefresh) {
      const storedAccess = readStored(JWT_KEY)
      if (storedAccess && !accessTokenExpired(storedAccess)) {
        setSessionTokens({ accessToken: storedAccess, refreshToken: storedRefresh })
        return storedAccess
      }
      // Their access token is unusable — fall through and spend the rotated refresh
      // token, which is live either way.
    }

    try {
      const resp = await refreshClient.refreshSession({ refreshToken: storedRefresh })
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
  })

const authBearer: Interceptor = next => async req => {
  let token = getAccessToken()
  // Proactively refresh an expired/missing access token while a refresh token
  // exists, so the first request after the access window doesn't have to 401 first.
  const refreshToken = getRefreshToken()
  if ((!token || accessTokenExpired(token)) && refreshToken) {
    token = (await refreshAccessToken(refreshToken)) ?? ''
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
    // Re-read rather than reusing the value from above: the proactive path may have
    // rotated it since.
    const currentRefresh = getRefreshToken()
    if (!currentRefresh) throw err
    const fresh = await refreshAccessToken(currentRefresh)
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

// Transport for unauthenticated public endpoints (shared dashboards). Deliberately
// WITHOUT authBearer so the public read path never attaches a logged-in viewer's
// JWT or triggers a token refresh — it must behave identically for an anonymous
// visitor, which also keeps the backend's token-independent authz path exercised.
export const publicTransportAtom = atom(() => {
  return createConnectTransport({
    baseUrl: apiBaseUrl,
    interceptors: [protovalidate],
  })
})
