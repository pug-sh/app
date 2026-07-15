import { beforeEach, describe, expect, test } from 'bun:test'
import { createClient } from '@connectrpc/connect'
import { OrgsService } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'

// Tests for the authBearer interceptor in src/network/transport.ts: token
// attachment, proactive + reactive refresh, what does and does not kill a session,
// and the two layers of single-flight that keep a refresh from being replayed.
//
// The refresh token is SINGLE-USE: the server consumes it on rotation and treats a
// second presentation as a replay attack, revoking the whole family and logging the
// user out everywhere. So "how many times did we call RefreshSession" is the load
// -bearing assertion in most of what follows, not an incidental detail.
//
// Everything is driven through the real transport against a stubbed fetch rather
// than by calling internals, because the interceptor is not exported — and because
// the wiring (which client gets authBearer, which deliberately does not) is part of
// what can break.

const JWT_KEY = 'pug:jwt'
const REFRESH_KEY = 'pug:refresh'
// Must match REFRESH_LOCK in transport.ts. Not exported, and deliberately not
// imported: these tests pin the name from the outside, so a rename that silently
// stopped tabs from serializing against each other fails here.
const REFRESH_LOCK = 'pug:refresh-lock'

const REFRESH_PATH = '/public.auth.v1.AuthService/RefreshSession'
const LIST_PATH = '/dashboard.orgs.v1.OrgsService/List'

// --- fake browser storage -----------------------------------------------------
// Bun has no localStorage. jotai's atomWithStorage reads window.localStorage while
// jwt.atoms.ts's readStored reads the bare global, so both must point at ONE object
// or writes through the atoms would be invisible to the reads under test.

const makeStorage = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v)
    },
    removeItem: (k: string) => {
      m.delete(k)
    },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

const storage = makeStorage()

// --- fake Web Locks -----------------------------------------------------------
// A real exclusive FIFO mutex, not a spy: the cross-tab tests below depend on
// callbacks actually queueing behind each other, which is the behavior being
// verified. Bun exposes no navigator.locks, so without this the cross-tab path
// would silently take transport.ts's no-Web-Locks fallback and prove nothing.

const createLockManager = () => {
  const tail = new Map<string, Promise<unknown>>()
  const outstanding = new Map<string, number>()
  return {
    request<T>(name: string, cb: () => Promise<T>): Promise<T> {
      outstanding.set(name, (outstanding.get(name) ?? 0) + 1)
      const prev = tail.get(name) ?? Promise.resolve()
      // Run once the previous holder settles, however it settled.
      const run = prev.then(cb, cb)
      run.finally(() => outstanding.set(name, (outstanding.get(name) ?? 1) - 1))
      // Swallow rejection on the queue chain only — a failed holder must not wedge
      // every tab behind it. The caller still sees `run` reject.
      tail.set(
        name,
        run.then(
          () => {},
          () => {},
        ),
      )
      return run
    },
    // Holders + waiters. Used to prove tabs genuinely contended rather than
    // happening to run in sequence.
    outstandingFor: (name: string) => outstanding.get(name) ?? 0,
  }
}

let locks = createLockManager()

// biome-ignore lint/suspicious/noExplicitAny: installing browser globals Bun lacks
const g = globalThis as any
g.localStorage = storage
g.window = { localStorage: storage, addEventListener() {}, removeEventListener() {} }
Object.defineProperty(g.navigator, 'locks', {
  configurable: true,
  get: () => locks,
})
process.env.VITE_API_BASE_URL = 'http://transport.test'

// --- fake Connect server ------------------------------------------------------

const connectOk = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

// Connect maps an error code to an HTTP status and a {code, message} body.
const connectErr = (code: string, status: number) =>
  new Response(JSON.stringify({ code, message: code }), {
    status,
    headers: { 'content-type': 'application/json' },
  })

interface Server {
  refreshCalls: number
  listAuthHeaders: (string | null)[]
  onRefresh: () => Promise<Response>
  onList: (auth: string | null) => Promise<Response>
}

let server: Server

const installServer = () => {
  server = {
    refreshCalls: 0,
    listAuthHeaders: [],
    onRefresh: async () => connectOk({ token: 'unset', refreshToken: 'unset' }),
    onList: async () => connectOk({ orgs: [] }),
  }
  g.fetch = async (input: Request | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init)
    const path = new URL(req.url).pathname
    if (path === REFRESH_PATH) {
      server.refreshCalls++
      return server.onRefresh()
    }
    if (path === LIST_PATH) {
      const auth = req.headers.get('authorization')
      server.listAuthHeaders.push(auth)
      return server.onList(auth)
    }
    throw new Error(`unexpected fetch: ${path}`)
  }
}

// --- helpers ------------------------------------------------------------------

// A structurally valid JWT for readJWT: it only base64-decodes the payload and
// requires exp + sub. The signature is never checked client-side.
const jwt = (label: string, expiresInSec: number) => {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64')
  const payload = {
    sub: 'cust-1',
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
    iss: 'pug/auth',
    jti: label,
  }
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.sig-${label}`
}

// transport.ts treats a token within 15s of exp as already expired, so "fresh"
// must clear that leeway.
const FRESH = jwt('fresh', 3600)
const FRESH2 = jwt('fresh2', 3600)
const EXPIRED = jwt('expired', -60)

const seed = (access: string, refresh: string) => {
  storage.setItem(JWT_KEY, JSON.stringify(access))
  storage.setItem(REFRESH_KEY, JSON.stringify(refresh))
}

const storedAccess = () => JSON.parse(storage.getItem(JWT_KEY) ?? '""')
const storedRefresh = () => JSON.parse(storage.getItem(REFRESH_KEY) ?? '""')

// Load a fresh instance of the transport module. Each distinct `realm` gets its own
// module scope — crucially its own refreshInFlight — which is what makes it stand in
// for a separate browser tab. localStorage and navigator.locks stay global, exactly
// as real tabs share them.
const loadTransport = async (realm: string) => {
  const mod = await import(`@/network/transport?realm=${realm}`)
  const { getDefaultStore } = await import('jotai')
  return createClient(OrgsService, getDefaultStore().get(mod.transportAtom))
}

const until = async (pred: () => boolean, label: string) => {
  for (let i = 0; i < 400; i++) {
    if (pred()) return
    await new Promise(r => setTimeout(r, 5))
  }
  throw new Error(`timed out waiting for: ${label}`)
}

let realmSeq = 0
// Each test gets a virgin module scope, so one test's in-flight refresh or cached
// token can't leak into the next.
const freshTab = () => loadTransport(`t${realmSeq++}`)

beforeEach(async () => {
  storage.clear()
  locks = createLockManager()
  installServer()
  // The token atoms are module-scoped and shared across realms (only transport.ts
  // is re-instantiated), so reset them explicitly between tests.
  const atoms = await import('@/auth/jwt.atoms')
  atoms.clearSession()
  storage.clear()
})

// --- attachment + proactive refresh -------------------------------------------

describe('authBearer token attachment', () => {
  test('sends a fresh access token as-is and does not refresh', async () => {
    seed(FRESH, 'R1')
    const client = await freshTab()

    await client.list({})

    expect(server.listAuthHeaders).toEqual([`Bearer ${FRESH}`])
    expect(server.refreshCalls).toBe(0)
  })

  test('refreshes an expired access token before sending, and sends the rotated one', async () => {
    seed(EXPIRED, 'R1')
    server.onRefresh = async () => connectOk({ token: FRESH2, refreshToken: 'R2' })
    const client = await freshTab()

    await client.list({})

    // The expired token must never reach the wire — the request carries the new one.
    expect(server.listAuthHeaders).toEqual([`Bearer ${FRESH2}`])
    expect(server.refreshCalls).toBe(1)
    expect(storedAccess()).toBe(FRESH2)
    expect(storedRefresh()).toBe('R2')
  })

  test('refreshes when there is no access token but a refresh token exists', async () => {
    seed('', 'R1')
    server.onRefresh = async () => connectOk({ token: FRESH2, refreshToken: 'R2' })
    const client = await freshTab()

    await client.list({})

    expect(server.listAuthHeaders).toEqual([`Bearer ${FRESH2}`])
    expect(server.refreshCalls).toBe(1)
  })

  test('sends no Authorization header when there is no session at all', async () => {
    const client = await freshTab()

    await client.list({})

    expect(server.listAuthHeaders).toEqual([null])
    expect(server.refreshCalls).toBe(0)
  })
})

// --- reactive 401 -------------------------------------------------------------

describe('authBearer 401 retry', () => {
  test('refreshes once and retries when a business RPC 401s', async () => {
    seed(FRESH, 'R1')
    server.onRefresh = async () => connectOk({ token: FRESH2, refreshToken: 'R2' })
    // Reject the first (validly fresh) token, accept the rotated one — i.e. the
    // token was revoked server-side before its own exp.
    server.onList = async auth =>
      auth === `Bearer ${FRESH2}` ? connectOk({ orgs: [] }) : connectErr('unauthenticated', 401)
    const client = await freshTab()

    await client.list({})

    expect(server.listAuthHeaders).toEqual([`Bearer ${FRESH}`, `Bearer ${FRESH2}`])
    expect(server.refreshCalls).toBe(1)
  })

  test('a second 401 propagates and does NOT kill the session', async () => {
    // The backend also returns Unauthenticated for authorization failures (e.g. a
    // forbidden x-project-id). Treating that as session death would log out a user
    // who merely opened the wrong project, so only doRefresh may end a session.
    seed(FRESH, 'R1')
    server.onRefresh = async () => connectOk({ token: FRESH2, refreshToken: 'R2' })
    server.onList = async () => connectErr('unauthenticated', 401)
    const client = await freshTab()

    await expect(client.list({})).rejects.toThrow()

    expect(server.refreshCalls).toBe(1)
    expect(storedRefresh()).toBe('R2')
  })
})

// --- session death ------------------------------------------------------------

describe('session death', () => {
  test('clears the session when RefreshSession is rejected as Unauthenticated', async () => {
    // The server authoritatively rejected the refresh token: expired, revoked, or
    // detected as reused. Nothing left to try.
    seed(EXPIRED, 'R1')
    server.onRefresh = async () => connectErr('unauthenticated', 401)
    const client = await freshTab()

    await expect(client.list({})).rejects.toThrow()

    expect(storedAccess()).toBe('')
    expect(storedRefresh()).toBe('')
    // Never sent — no point spending a request on a token we know is dead.
    expect(server.listAuthHeaders).toEqual([])
  })

  test('keeps the session when RefreshSession fails transiently', async () => {
    // Offline, a 5xx mid-deploy, a timeout: the refresh token is almost certainly
    // still good. Logging users out on infrastructure noise is the exact failure
    // the refresh flow exists to avoid.
    seed(EXPIRED, 'R1')
    server.onRefresh = async () => connectErr('unavailable', 503)
    const client = await freshTab()

    await expect(client.list({})).rejects.toThrow()

    expect(storedRefresh()).toBe('R1')
  })

})

// --- single-flight, one tab ---------------------------------------------------

describe('single-flight within a tab', () => {
  test('concurrent requests share ONE RefreshSession call', async () => {
    seed(EXPIRED, 'R1')
    server.onRefresh = async () => connectOk({ token: FRESH2, refreshToken: 'R2' })
    const client = await freshTab()

    await Promise.all([client.list({}), client.list({}), client.list({}), client.list({})])

    // Four calls, one rotation. Two would have been a replay of R1.
    expect(server.refreshCalls).toBe(1)
    expect(server.listAuthHeaders).toEqual(Array(4).fill(`Bearer ${FRESH2}`))
  })
})

// --- single-flight, across tabs -----------------------------------------------

describe('single-flight across tabs', () => {
  test('two tabs waking together make exactly ONE RefreshSession call', async () => {
    // The regression this guards: every tab shares one localStorage refresh token,
    // and refreshInFlight is module-scoped, so it cannot see across tabs. Both tabs
    // would present R1; the loser trips reuse-detection and the server revokes the
    // whole family, hard-logging the user out of every tab.
    seed(EXPIRED, 'R1')
    let release!: () => void
    const gate = new Promise<void>(r => {
      release = r
    })
    server.onRefresh = async () => {
      await gate
      return connectOk({ token: FRESH2, refreshToken: 'R2' })
    }

    const tabA = await freshTab()
    const tabB = await freshTab()
    const a = tabA.list({})
    const b = tabB.list({})

    // Both tabs independently decided to refresh and are on the lock — the race is
    // real, not an artifact of one tab happening to finish first.
    await until(() => locks.outstandingFor(REFRESH_LOCK) === 2, 'both tabs queued on the refresh lock')
    release()
    await Promise.all([a, b])

    expect(server.refreshCalls).toBe(1)
    expect(server.listAuthHeaders).toEqual([`Bearer ${FRESH2}`, `Bearer ${FRESH2}`])
  })

  test('a tab queued behind another tab adopts the winner instead of replaying', async () => {
    // The lock alone is not the fix. A tab that queues, wakes, and then presents the
    // token it captured BEFORE waiting still replays a consumed token — just later.
    // The re-read inside the lock is what makes the lock worth holding.
    seed(EXPIRED, 'R1')

    // Stand in for the other tab: hold the lock and, while holding it, land a
    // rotation in localStorage exactly as that tab's own doRefresh would.
    let finishOther!: () => void
    const otherHasLock = new Promise<void>(signalHeld => {
      locks.request(REFRESH_LOCK, async () => {
        signalHeld()
        await new Promise<void>(r => {
          finishOther = r
        })
        seed(FRESH2, 'R2')
      })
    })
    await otherHasLock

    const client = await freshTab()
    const pending = client.list({})
    await until(() => locks.outstandingFor(REFRESH_LOCK) === 2, 'tab queued behind the other tab')
    finishOther()
    await pending

    // R1 was consumed by the other tab. Presenting it would have killed the family.
    expect(server.refreshCalls).toBe(0)
    expect(server.listAuthHeaders).toEqual([`Bearer ${FRESH2}`])
  })

  test('falls back to in-tab serialization when Web Locks is unavailable', async () => {
    // Non-secure origins have no navigator.locks. Degrading to the old per-tab
    // behavior is acceptable; throwing on every request is not.
    // biome-ignore lint/suspicious/noExplicitAny: simulating a locks-less browser
    const withoutLocks = undefined as any
    const saved = locks
    locks = withoutLocks
    try {
      seed(EXPIRED, 'R1')
      server.onRefresh = async () => connectOk({ token: FRESH2, refreshToken: 'R2' })
      const client = await freshTab()

      await Promise.all([client.list({}), client.list({})])

      expect(server.refreshCalls).toBe(1)
      expect(server.listAuthHeaders).toEqual([`Bearer ${FRESH2}`, `Bearer ${FRESH2}`])
    } finally {
      locks = saved
    }
  })
})
