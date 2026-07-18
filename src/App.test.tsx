import { create } from '@bufbuild/protobuf'
import { render, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'

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

const { WorkspaceBootstrap } = await import('./App')
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

// Stored visits are keyed by the customer in the JWT, so these tests need one. Only the payload is
// ever parsed (readJWT), so the header and signature can be anything.
const jwtFor = (customerId: string) => `h.${btoa(JSON.stringify({ exp: 9e9, sub: customerId }))}.s`

const mount = ({ path = '/', lastProjectByOrg }: { path?: string; lastProjectByOrg?: Record<string, string> } = {}) => {
  const store = createStore()
  store.set(refreshTokenAtom, 'refresh-token') // what isAuthenticatedAtom derives from
  store.set(jwtAtom, jwtFor('cust-1'))
  store.set(bootstrapStatusAtom, 'ready')
  store.set(activeOrgAtom, orgA)
  // Seeded through the real write path rather than by poking the stored shape, so these tests break
  // if recording a visit breaks.
  for (const [orgId, projectId] of Object.entries(lastProjectByOrg ?? {})) {
    store.set(rememberLastProjectAtom, { orgId, projectId })
  }

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
    const store = createStore()
    store.set(refreshTokenAtom, 'refresh-token')
    store.set(jwtAtom, jwtFor('cust-1'))
    store.set(bootstrapStatusAtom, 'ready')
    store.set(activeOrgAtom, orgA)
    store.set(rememberLastProjectAtom, { orgId: 'org-a', projectId: 'p2' })

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
