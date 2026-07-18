import { create } from '@bufbuild/protobuf'
import { act, render, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { jwtFor } from '@/test/jwt'

const { batchGet, orgsList, orgsGet } = vi.hoisted(() => ({
  batchGet: vi.fn(),
  orgsList: vi.fn(),
  orgsGet: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    projectsRPCAtom: atom({ batchGet }),
    orgsRPCAtom: atom({ list: orgsList, get: orgsGet }),
  }
})

// Identity reports the settled workspace to Pug. It's mounted by App, not by the component under
// test, but auth.atoms pulls the analytics module in regardless — stub the ingest so no test ever
// reaches for the network.
vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  isAnalyticsEnabled: () => false,
}))

const { SessionUrlGuard, WorkspaceBootstrap } = await import('./App')
const { ProjectRedirect, ProjectSync } = await import('@/pages/router')
const { activeOrgAtom, activeProjectAtom, bootstrapStatusAtom, rememberLastProjectAtom } = await import(
  '@/data/workspace.atoms'
)
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')

const orgA = create(OrgSchema, { id: 'org-a', displayName: 'Org A' })
const projects = [
  create(ProjectSchema, { id: 'p1', displayName: 'First' }),
  create(ProjectSchema, { id: 'p2', displayName: 'Second' }),
]

// A signed-in store with an org already picked. Stored visits are keyed by the customer in the JWT,
// so these tests need one.
const seedStore = (lastProjectByOrg?: Record<string, string>) => {
  const store = createStore()
  store.set(refreshTokenAtom, 'refresh-token') // what isAuthenticatedAtom derives from
  store.set(jwtAtom, jwtFor('cust-1'))
  store.set(bootstrapStatusAtom, 'ready')
  store.set(activeOrgAtom, orgA)
  // Seeded through the real write path rather than by poking the stored shape, so a total break in
  // recording a visit surfaces here. It does not pin the customer keying itself — every test in this
  // file passes against an org-keyed store; workspace.atoms.test.ts is what covers that.
  for (const [orgId, projectId] of Object.entries(lastProjectByOrg ?? {})) {
    store.set(rememberLastProjectAtom, { orgId, projectId })
  }
  return store
}

const mount = ({ path = '/', lastProjectByOrg }: { path?: string; lastProjectByOrg?: Record<string, string> } = {}) => {
  const store = seedStore(lastProjectByOrg)

  render(
    <Provider store={store}>
      <Router hook={memoryLocation({ path }).hook}>
        <WorkspaceBootstrap />
      </Router>
    </Provider>,
  )
  return store
}

describe('WorkspaceBootstrap default project pick', () => {
  beforeEach(() => {
    batchGet.mockResolvedValue({ projects })
  })

  it('restores the last project visited in this org when the URL names none', async () => {
    const store = mount({ path: '/', lastProjectByOrg: { 'org-a': 'p2' } })

    // The bug this covers: landing on the bare app URL ignored the stored pick and took projects[0],
    // so every visit to app.pug.sh dropped you back into the org's first project.
    await waitFor(() => expect(store.get(activeProjectAtom)?.id).toBe('p2'))
  })

  it('falls back to the first project when the org has no stored visit', async () => {
    const store = mount({ path: '/' })

    await waitFor(() => expect(store.get(activeProjectAtom)?.id).toBe('p1'))
  })

  it('falls back to the first project when the stored pick is no longer available', async () => {
    const store = mount({ path: '/', lastProjectByOrg: { 'org-a': 'deleted-project' } })

    await waitFor(() => expect(store.get(activeProjectAtom)?.id).toBe('p1'))
  })

  it('ignores a visit stored against a different org', async () => {
    const store = mount({ path: '/', lastProjectByOrg: { 'org-b': 'p2' } })

    await waitFor(() => expect(store.get(activeProjectAtom)?.id).toBe('p1'))
  })

  it('leaves a route-named project to ProjectSync rather than default-picking over it', async () => {
    // Defaulting here would win the race against ProjectSync and make a project the user never asked
    // for briefly active — which workspaceSettledAtom would report as the settled workspace.
    const store = mount({ path: '/p/p2/overview', lastProjectByOrg: { 'org-a': 'p1' } })

    await waitFor(() => expect(batchGet).toHaveBeenCalled())
    await Promise.resolve()
    expect(store.get(activeProjectAtom)).toBeNull()
  })

  it('still defaults when the route names a project this org does not have', async () => {
    // ProjectSync renders "Project not found" over this, and needs a sane fallback behind it.
    const store = mount({ path: '/p/gone/overview', lastProjectByOrg: { 'org-a': 'p2' } })

    await waitFor(() => expect(store.get(activeProjectAtom)?.id).toBe('p2'))
  })
})

describe('another tab signing in as someone else', () => {
  beforeEach(() => {
    batchGet.mockResolvedValue({ projects })
    orgsList.mockResolvedValue({ orgs: [] })
  })

  it('rebuilds the workspace rather than carrying the previous account into it', async () => {
    const store = mount({ path: '/' })
    await waitFor(() => expect(store.get(activeProjectAtom)?.id).toBe('p1'))

    // What a storage event from the other tab's sign-in does here: the token syncs, the workspace
    // doesn't. Left standing, this tab keeps cust-1's org and project under cust-2's session — and
    // files the next visit it records against cust-2, which is the collision this all exists to stop.
    store.set(jwtAtom, jwtFor('cust-2'))

    await waitFor(() => expect(store.get(activeOrgAtom)).toBeNull())
    expect(store.get(activeProjectAtom)).toBeNull()
  })

  it('leaves the workspace alone when the same account refreshes its token', async () => {
    const store = mount({ path: '/' })
    await waitFor(() => expect(store.get(activeProjectAtom)?.id).toBe('p1'))

    // The transport re-mints this hourly: a different token string carrying the same `sub`. It must
    // not read as an account switch — tearing the workspace down on every refresh would bounce every
    // active user through a full reload once an hour.
    //
    // Inside act, or the effect under test hasn't run when the assertions below read the workspace,
    // and they hold no matter what it does — an `await Promise.resolve()` here passes even against a
    // reset keyed on the raw token, which fires on every refresh.
    await act(async () => {
      store.set(jwtAtom, jwtFor('cust-1', 9e9 + 1))
    })

    expect(store.get(activeOrgAtom)).toBe(orgA)
    expect(store.get(activeProjectAtom)?.id).toBe('p1')
  })
})

describe('dropping the project URL when a session ends', () => {
  const mountGuard = (path: string, { authenticated = true } = {}) => {
    const { hook, history } = memoryLocation({ path, record: true })
    const store = createStore()
    if (authenticated) store.set(refreshTokenAtom, 'refresh-token')

    render(
      <Provider store={store}>
        <Router hook={hook}>
          <SessionUrlGuard />
        </Router>
      </Provider>,
    )
    return { store, history }
  }

  it('sends you off the project URL when the session ends under you', async () => {
    const { store, history } = mountGuard('/p/p1/overview')

    // What clearSession does when the server rejects the refresh token — no button, no navigate of
    // its own. Left alone, the next account to sign in on this browser inherits /p/p1.
    store.set(refreshTokenAtom, '')

    await waitFor(() => expect(history.at(-1)).toBe('/'))
  })

  it('replaces rather than pushes, so Back cannot walk into the dropped URL', async () => {
    const { store, history } = mountGuard('/p/p1/overview')
    store.set(refreshTokenAtom, '')

    await waitFor(() => expect(history.at(-1)).toBe('/'))
    // A push would leave the project URL one Back press away — still rendering <SignIn />, so it
    // looks fine, and signing in there hands the next account the project this just dropped.
    expect(history).not.toContain('/p/p1/overview')
  })

  it('leaves a project URL alone when you arrive already signed out', async () => {
    // The other half of the rule: a shared /p/ link opened by a signed-out user has to survive the
    // sign-in that follows it. Redirecting on !authenticated rather than on the transition would
    // drop the deep link here and land them on their own default project instead.
    const { history } = mountGuard('/p/p1/overview', { authenticated: false })

    await Promise.resolve()
    expect(history.at(-1)).toBe('/p/p1/overview')
  })

  it('leaves a non-project URL alone', async () => {
    // /demo signs an existing session out to enter the demo; it has no project URL to drop, and
    // rewriting it would bounce the user out of the confirm step.
    const { store, history } = mountGuard('/demo')

    // Inside act, or the effect this is asserting about hasn't run yet and the assertion holds no
    // matter what the guard does — an `await Promise.resolve()` here passes with the /p/ scope
    // check deleted outright.
    await act(async () => {
      store.set(refreshTokenAtom, '')
    })

    expect(history.at(-1)).toBe('/demo')
  })
})

describe('landing on the bare app URL', () => {
  beforeEach(() => {
    batchGet.mockResolvedValue({ projects })
  })

  // The pick and the redirect are separate components racing for the first navigation off '/', so
  // neither one alone proves the user gets where they left off. It has to be rendered through the
  // real Switch: a wrong redirect is not self-correcting, because changing the URL unmounts
  // ProjectRedirect and hands the wrong id to ProjectSync, which adopts it as the active project.
  // Rendered bare, ProjectRedirect would just re-navigate once the pick landed and pass either way.
  it('sends you to the project you left off in', async () => {
    const { hook, history } = memoryLocation({ path: '/', record: true })
    const store = seedStore({ 'org-a': 'p2' })

    render(
      <Provider store={store}>
        <Router hook={hook}>
          <WorkspaceBootstrap />
          <Switch>
            {/* The real routes' shape, with a stub for the page body: every generated page sits
                under /p/:projectId behind ProjectSync, and '/' falls through to the redirect. */}
            <Route path="/p/:projectId/overview">
              <ProjectSync>
                <div>overview</div>
              </ProjectSync>
            </Route>
            <Route>
              <ProjectRedirect />
            </Route>
          </Switch>
        </Router>
      </Provider>,
    )

    await waitFor(() => expect(history.at(-1)).toBe('/p/p2/overview'))
    expect(store.get(activeProjectAtom)?.id).toBe('p2')
  })
})
