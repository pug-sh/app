import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { act, render, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
// Type-only, so it is erased and cannot run before the vi.mock factories below.
import type { Me } from '@/auth/auth.atoms'
import { jwtFor } from '@/test/jwt'

const { batchGet, orgsList, orgsGet, getMe, demoSignIn, completeMagicLink, identifyCustomer, resetIdentity } =
  vi.hoisted(() => ({
    batchGet: vi.fn(),
    orgsList: vi.fn(),
    orgsGet: vi.fn(),
    getMe: vi.fn(),
    demoSignIn: vi.fn(),
    completeMagicLink: vi.fn(),
    identifyCustomer: vi.fn(),
    resetIdentity: vi.fn(),
  }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    projectsRPCAtom: atom({ batchGet }),
    orgsRPCAtom: atom({ list: orgsList, get: orgsGet }),
    customersRPCAtom: atom({ getMe }),
    authRPCAtom: atom({ demoSignIn, completeMagicLink }),
  }
})

// The ingest is stubbed; what these tests read is what identity decided to state, and when.
vi.mock('./pug', () => ({
  analyticsEnabled: true,
  identifyCustomer,
  resetIdentity,
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  initAnalytics: vi.fn(),
}))

const AnalyticsIdentity = (await import('./identity')).default
const { WorkspaceBootstrap } = await import('@/App')
const { activeOrgAtom, activeProjectAtom, bootstrapStatusAtom } = await import('@/data/workspace.atoms')
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')
const { completeMagicLinkAtom, demoSignInAtom, fetchMeAtom } = await import('@/auth/auth.atoms')

const orgA = create(OrgSchema, { id: 'org-a', displayName: 'Org A' })
const orgB = create(OrgSchema, { id: 'org-b', displayName: 'Org B' })
const projects = [create(ProjectSchema, { id: 'p1', displayName: 'First' })]

const ada: Me = { customerId: 'cust-1', email: 'ada@pug.sh', emailVerified: true }
const bob: Me = { customerId: 'cust-2', email: 'bob@pug.sh', emailVerified: true }
const offline = () => new ConnectError('offline', Code.Unavailable)

// A GetMe the test resolves by hand: the whole question here is what identity does in the window
// between the workspace settling and the email arriving, which a pre-resolved mock closes.
const deferredMe = () => {
  let settle!: (me: Me) => void
  let fail!: (err: Error) => void
  const promise = new Promise<Me>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  getMe.mockReturnValueOnce(promise)
  return { settle, fail }
}

// The real bootstrap, because "when is the workspace settled" is half of what is under test, in
// App.tsx's child order — identity's effects flush before the workspace resets.
// jwt null is the demo case, which signs itself in rather than booting with a session.
const mount = (jwt: string | null = jwtFor('cust-1')) => {
  const store = createStore()
  store.set(refreshTokenAtom, 'refresh-token')
  if (jwt) store.set(jwtAtom, jwt)
  store.set(bootstrapStatusAtom, 'ready')
  store.set(activeOrgAtom, orgA)

  render(
    <Provider store={store}>
      <Router hook={memoryLocation({ path: '/' }).hook}>
        <AnalyticsIdentity awaitWorkspace />
        <WorkspaceBootstrap />
      </Router>
    </Provider>,
  )
  return store
}

const settledWorkspace = (store: ReturnType<typeof mount>) =>
  waitFor(() => expect(store.get(activeProjectAtom)?.id).toBe('p1'))

describe('analytics identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks leaves the mockReturnValueOnce queue, so a lookup a test expected but never got
    // would surface as the *next* test resolving someone else's GetMe.
    getMe.mockReset()
    batchGet.mockResolvedValue({ projects })
    orgsList.mockResolvedValue({ orgs: [orgA] })
    orgsGet.mockResolvedValue({ org: orgA })
  })

  it('holds the first identify until the email lands, then states it once', async () => {
    const me = deferredMe()
    const store = mount()

    await settledWorkspace(store)
    // The workspace is done and the email is not. Identifying here is what the gate exists to stop:
    // it files the session under an id with no address on it and spends a second call to correct it.
    expect(identifyCustomer).not.toHaveBeenCalled()

    await act(async () => {
      me.settle(ada)
    })

    await waitFor(() => expect(identifyCustomer).toHaveBeenCalledTimes(1))
    expect(identifyCustomer).toHaveBeenCalledWith('cust-1', expect.objectContaining({ email: 'ada@pug.sh' }))
  })

  it('states the session anyway when GetMe fails', async () => {
    const me = deferredMe()
    const store = mount()

    await settledWorkspace(store)
    // Without this the test also passes against a component that has no gate at all.
    expect(identifyCustomer).not.toHaveBeenCalled()

    await act(async () => {
      me.fail(offline())
    })

    // Without the error escape the gate never opens and the session stays anonymous for good.
    await waitFor(() => expect(identifyCustomer).toHaveBeenCalledTimes(1))
    expect(identifyCustomer).toHaveBeenCalledWith('cust-1', expect.not.objectContaining({ email: expect.anything() }))
  })

  it('never carries one account’s email onto the next', async () => {
    const first = deferredMe()
    const store = mount()

    await settledWorkspace(store)
    await act(async () => {
      first.settle(ada)
    })
    await waitFor(() => expect(identifyCustomer).toHaveBeenCalledTimes(1))

    // Signing in as someone else in another tab: the JWT syncs here through storage, and nothing in
    // this tab clears the email that came with the last one.
    const second = deferredMe()
    act(() => {
      store.set(jwtAtom, jwtFor('cust-2'))
    })
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    // The SDK holds identity until told otherwise; without the reset the new account's first events
    // are billed to the one just left.
    expect(resetIdentity).toHaveBeenCalled()

    await act(async () => {
      second.settle(bob)
    })

    await waitFor(() =>
      expect(identifyCustomer).toHaveBeenCalledWith('cust-2', expect.objectContaining({ email: 'bob@pug.sh' })),
    )
    expect(identifyCustomer).not.toHaveBeenCalledWith('cust-2', expect.objectContaining({ email: 'ada@pug.sh' }))
  })

  it('never carries an email onto the next account on the shared-dashboard route', async () => {
    const store = createStore()
    store.set(refreshTokenAtom, 'refresh-token')
    store.set(jwtAtom, jwtFor('cust-1'))

    // The route never fetches for itself, so the address can only be one an earlier visit left.
    getMe.mockResolvedValueOnce(ada)
    await act(async () => {
      await store.set(fetchMeAtom)
    })

    render(
      <Provider store={store}>
        <AnalyticsIdentity awaitWorkspace={false} />
      </Provider>,
    )

    // Asserted in both directions: against a meAtom that just always returned null, the switch
    // below would look correct for the wrong reason and this test would pass without the mask.
    await waitFor(() =>
      expect(identifyCustomer).toHaveBeenCalledWith('cust-1', expect.objectContaining({ email: 'ada@pug.sh' })),
    )

    // A cross-tab sign-in. awaitWorkspace false leaves emailExpected false, so the meStatus gate is
    // skipped entirely and the keyed read on meAtom is the only thing between cust-1's address and
    // cust-2's profile — no fetch runs here to clear it, the way one does everywhere else.
    act(() => {
      store.set(jwtAtom, jwtFor('cust-2'))
    })

    await waitFor(() => expect(identifyCustomer).toHaveBeenCalledWith('cust-2', {}))
    expect(identifyCustomer).not.toHaveBeenCalledWith('cust-2', expect.objectContaining({ email: 'ada@pug.sh' }))
  })

  it('does not let a failed lookup for one account state the next', async () => {
    const first = deferredMe()
    const store = mount()

    await settledWorkspace(store)
    await act(async () => {
      first.fail(offline())
    })
    await waitFor(() => expect(identifyCustomer).toHaveBeenCalledTimes(1))

    const second = deferredMe()
    act(() => {
      store.set(jwtAtom, jwtFor('cust-2'))
    })
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))

    // An unkeyed status let cust-1's failure open the gate for cust-2 — and state it with cust-1's
    // org traits, since the workspace hasn't reset this render either.
    expect(identifyCustomer).not.toHaveBeenCalledWith('cust-2', expect.anything())

    await act(async () => {
      second.settle(bob)
    })
    await waitFor(() =>
      expect(identifyCustomer).toHaveBeenCalledWith('cust-2', expect.objectContaining({ email: 'bob@pug.sh' })),
    )
  })

  it('recovers when the session drops mid-lookup and returns to the same account', async () => {
    const first = deferredMe()
    const store = mount()
    await settledWorkspace(store)

    // A cross-tab sign-out, or a refresh the server rejects (transport's clearSession). Either way
    // the JWT is emptied by a path that never runs clearMe, and the in-flight GetMe is abandoned.
    act(() => {
      store.set(jwtAtom, '')
    })
    await act(async () => {
      first.fail(new ConnectError('unauthenticated', Code.Unauthenticated))
    })

    // Back in as the same customer, so the key matches whatever the abandoned call left behind.
    // Left claimed, that debris reads as 'loading' — past the refetch trigger, short of the gate —
    // and this tab reports every later event as an anonymous stranger for the rest of its life.
    const second = deferredMe()
    act(() => {
      store.set(jwtAtom, jwtFor('cust-1'))
    })

    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    await act(async () => {
      second.settle(ada)
    })
    await settledWorkspace(store)

    await waitFor(() =>
      expect(identifyCustomer).toHaveBeenCalledWith('cust-1', expect.objectContaining({ email: 'ada@pug.sh' })),
    )
  })

  it('refetches the email after a demo round-trip back to the same account', async () => {
    const first = deferredMe()
    const store = mount()

    await settledWorkspace(store)
    await act(async () => {
      first.settle(ada)
    })
    await waitFor(() => expect(identifyCustomer).toHaveBeenCalledTimes(1))

    // Into the demo and back out on a magic link, no sign-out in between — it lands back on a
    // customer this component has already fetched for.
    demoSignIn.mockResolvedValue({ token: jwtFor('snoop'), refreshToken: 'refresh-token' })
    completeMagicLink.mockResolvedValue({ token: jwtFor('cust-1'), refreshToken: 'refresh-token' })
    await act(async () => {
      await store.set(demoSignInAtom)
    })
    const second = deferredMe()
    await act(async () => {
      await store.set(completeMagicLinkAtom, { token: 'magic' })
    })

    // A ref would still read 'cust-1' and skip this, leaving the gate shut on 'idle' — no email,
    // and no later trait change either.
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    await act(async () => {
      second.settle(ada)
    })
    await settledWorkspace(store)

    act(() => {
      store.set(activeOrgAtom, orgB)
    })
    await waitFor(() =>
      expect(identifyCustomer).toHaveBeenCalledWith('cust-1', expect.objectContaining({ orgName: 'Org B' })),
    )
  })

  it('spends no lookup on a demo session', async () => {
    demoSignIn.mockResolvedValue({ token: jwtFor('snoop'), refreshToken: 'refresh-token' })
    const store = mount(null)

    await act(async () => {
      await store.set(demoSignInAtom)
    })
    await settledWorkspace(store)

    // One shared viewer account: never identified, and not worth a request to read its address.
    expect(getMe).not.toHaveBeenCalled()
    expect(identifyCustomer).not.toHaveBeenCalled()
  })
})
