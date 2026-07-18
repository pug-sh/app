import { create } from '@bufbuild/protobuf'
import { createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { jwtFor } from '@/test/jwt'

const { batchGet, orgsList, orgsGet, orgsUpdateDisplayName } = vi.hoisted(() => ({
  batchGet: vi.fn(),
  orgsList: vi.fn(),
  orgsGet: vi.fn(),
  orgsUpdateDisplayName: vi.fn(),
}))

// The RPC atoms build real ConnectRPC clients over the app's transport at read time. Swap the two
// this module reads for hand-held fakes, so a test can decide when — and whether — a call resolves.
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    projectsRPCAtom: atom({ batchGet }),
    orgsRPCAtom: atom({ list: orgsList, get: orgsGet, updateDisplayName: orgsUpdateDisplayName }),
  }
})

const {
  activeOrgAtom,
  activeProjectAtom,
  bootstrapStatusAtom,
  fetchProjectsAtom,
  orgsAtom,
  projectsAtom,
  refreshOrgsAtom,
  renameOrgAtom,
  resetWorkspaceAtom,
  selectOrgAtom,
  workspaceErrorAtom,
  workspaceSettledAtom,
} = await import('./workspace.atoms')

const org = (id: string) => create(OrgSchema, { id, displayName: id })
const project = (id: string) => create(ProjectSchema, { id, displayName: id })

const orgA = org('org-a')
const orgB = org('org-b')
const projectsOfA = [project('a1'), project('a2')]
const projectsOfB = [project('b1')]

// A batchGet whose resolution this test controls, so an org can change while it's still in flight.
const deferredBatchGet = () => {
  let settle!: (value: { projects: ReturnType<typeof project>[] }) => void
  let fail!: (err: Error) => void
  batchGet.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        settle = resolve
        fail = reject
      }),
  )
  return {
    settle: (projects: ReturnType<typeof project>[]) => settle({ projects }),
    fail: () => fail(new Error('down')),
  }
}

describe('fetchProjectsAtom', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('commits the list for the org that asked for it', async () => {
    const store = createStore()
    store.set(activeOrgAtom, orgA)
    batchGet.mockResolvedValueOnce({ projects: projectsOfA })

    await store.set(fetchProjectsAtom)

    expect(batchGet).toHaveBeenCalledWith({ orgId: 'org-a' })
    expect(store.get(projectsAtom)).toEqual(projectsOfA)
    expect(store.get(workspaceErrorAtom)).toBeNull()
  })

  it('drops a response that lands after the org changed', async () => {
    const store = createStore()
    store.set(activeOrgAtom, orgA)
    const inFlightA = deferredBatchGet()
    const pendingA = store.set(fetchProjectsAtom)

    // The user switches to org B while A's list is still in flight, and B's own fetch starts.
    store.set(selectOrgAtom, orgB)
    batchGet.mockResolvedValueOnce({ projects: projectsOfB })
    const pendingB = store.set(fetchProjectsAtom)

    inFlightA.settle(projectsOfA)
    await Promise.all([pendingA, pendingB])

    expect(store.get(projectsAtom)).toEqual(projectsOfB)
  })

  it('never reports a settled workspace around the departed org while a stale list is landing', async () => {
    const store = createStore()
    store.set(bootstrapStatusAtom, 'ready')
    store.set(activeOrgAtom, orgA)
    const inFlightA = deferredBatchGet()
    const pendingA = store.set(fetchProjectsAtom)

    store.set(selectOrgAtom, orgB)
    inFlightA.settle(projectsOfA)
    await pendingA

    // Had A's response committed, it would have keyed A's list to B and let a default pick of an
    // org-A project read as settled — which is what analytics would then report against org B.
    expect(store.get(projectsAtom)).toEqual([])
    expect(store.get(workspaceSettledAtom)).toBe(false)
  })

  it('drops a failure that lands after the org changed, leaving no error against the live org', async () => {
    const store = createStore()
    store.set(activeOrgAtom, orgA)
    const inFlightA = deferredBatchGet()
    const pendingA = store.set(fetchProjectsAtom)

    store.set(selectOrgAtom, orgB)
    inFlightA.fail()
    await pendingA

    expect(store.get(workspaceErrorAtom)).toBeNull()
  })

  it('drops a response that lands after the workspace was torn down', async () => {
    const store = createStore()
    store.set(activeOrgAtom, orgA)
    const inFlightA = deferredBatchGet()
    const pendingA = store.set(fetchProjectsAtom)

    // Signing out mid-flight nulls the org, which is the same staleness the org check catches.
    store.set(resetWorkspaceAtom)
    inFlightA.settle(projectsOfA)
    await pendingA

    expect(store.get(projectsAtom)).toEqual([])
    expect(store.get(activeProjectAtom)).toBeNull()
  })
})

describe('refreshOrgsAtom', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('replaces the list on success', async () => {
    const store = createStore()
    store.set(orgsAtom, [orgA])
    orgsList.mockResolvedValueOnce({ orgs: [orgA, orgB] })

    await store.set(refreshOrgsAtom)

    expect(store.get(orgsAtom)).toEqual([orgA, orgB])
  })

  it('leaves a live workspace standing when the list call fails', async () => {
    const store = createStore()
    store.set(activeOrgAtom, orgA)
    store.set(projectsAtom, projectsOfA)
    store.set(activeProjectAtom, projectsOfA[0])
    store.set(orgsAtom, [orgA, orgB])
    orgsList.mockRejectedValueOnce(new Error('down'))

    await store.set(refreshOrgsAtom)

    // The sidebar switcher runs this on mount, so reaching for fetchOrgsAtom here — which answers
    // the bootstrap question and clears the workspace when it can't — would put every session one
    // flaky list call from the workspace-error screen. Nothing but the list may move.
    expect(store.get(activeOrgAtom)).toBe(orgA)
    expect(store.get(activeProjectAtom)).toBe(projectsOfA[0])
    expect(store.get(projectsAtom)).toEqual(projectsOfA)
    expect(store.get(workspaceErrorAtom)).toBeNull()
    expect(store.get(orgsAtom)).toEqual([orgA, orgB])
  })
})

describe('renameOrgAtom', () => {
  it('renames the org in the list as well as the active one', async () => {
    const store = createStore()
    store.set(activeOrgAtom, orgA)
    store.set(orgsAtom, [orgA, orgB])
    orgsUpdateDisplayName.mockResolvedValueOnce({})

    await store.set(renameOrgAtom, { orgId: 'org-a', displayName: 'renamed' })

    // The sidebar switcher lists orgsAtom while its trigger reads activeOrgAtom. Update only the
    // active one and a rename shows the new name above the old one until the next refresh.
    expect(store.get(activeOrgAtom)?.displayName).toBe('renamed')
    expect(store.get(orgsAtom).map(org => org.displayName)).toEqual(['renamed', 'org-b'])
  })

  it('renames a listed org that is not the active one', async () => {
    const store = createStore()
    store.set(activeOrgAtom, orgA)
    store.set(orgsAtom, [orgA, orgB])
    orgsUpdateDisplayName.mockResolvedValueOnce({})

    await store.set(renameOrgAtom, { orgId: 'org-b', displayName: 'renamed' })

    expect(store.get(activeOrgAtom)).toBe(orgA)
    expect(store.get(orgsAtom).map(org => org.displayName)).toEqual(['org-a', 'renamed'])
  })
})

describe('lastProjectByOrgAtom', () => {
  it('reads storage on init, before anything mounts it', async () => {
    localStorage.setItem('pug:jwt', JSON.stringify(jwtFor('cust-1')))
    localStorage.setItem('pug:lastProjectByOrg', JSON.stringify({ customerId: 'cust-1', byOrg: { 'org-a': 'a2' } }))
    vi.resetModules()

    // Re-imported so the atom initializes against the seeded storage: getOnInit reads at atom
    // construction, which is module scope. A plain read here would see the already-built atom.
    // resetModules re-instantiates jwt.atoms alongside it, so the customer id is seeded the same way.
    const { lastProjectByOrgAtom: freshAtom } = await import('./workspace.atoms')

    // No mount, no effects — the value is there at the first synchronous read, which is the whole
    // point: the default pick runs before onMount would have gotten around to loading it. Both reads
    // have to be synchronous for this to pass; a lazy JWT would land an empty stamp here instead,
    // which no longer matches the stored one and reads as no visits.
    expect(createStore().get(freshAtom)).toEqual({ 'org-a': 'a2' })
  })

  it('does not hand a second account the first one’s project', async () => {
    // Fresh modules, or this inherits the generation the test above seeded: getOnInit bakes the
    // storage read into the atom at construction, so afterEach's localStorage.clear() cannot undo
    // it. Without this the assertions below are satisfied by that leftover value and keep passing
    // with the rememberLastProject calls deleted outright — verified, not hypothetical.
    vi.resetModules()
    const { jwtAtom } = await import('@/auth/jwt.atoms')
    const { lastProjectByOrgAtom, rememberLastProjectAtom } = await import('./workspace.atoms')
    const store = createStore()

    // Two accounts on one browser, both members of org-a.
    store.set(jwtAtom, jwtFor('cust-1'))
    store.set(rememberLastProjectAtom, { orgId: 'org-a', projectId: 'a1' })
    store.set(jwtAtom, jwtFor('cust-2'))

    // Keyed by org alone this came back 'a1' — the first account's project, restored for the second,
    // and then overwritten by the second's own next visit.
    expect(store.get(lastProjectByOrgAtom)).toEqual({})

    // Only one account's visits are kept, so recording cust-2's forgets cust-1's rather than filing
    // both. That is the trade the single slot makes: the collision is what has to go, not the
    // sign-back-in restore for an account that is rare on this browser to begin with.
    store.set(rememberLastProjectAtom, { orgId: 'org-a', projectId: 'a2' })
    expect(store.get(lastProjectByOrgAtom)).toEqual({ 'org-a': 'a2' })
    store.set(jwtAtom, jwtFor('cust-1'))
    expect(store.get(lastProjectByOrgAtom)).toEqual({})
  })

  it('ignores a value stored before visits carried a customer', async () => {
    localStorage.setItem('pug:jwt', JSON.stringify(jwtFor('cust-1')))
    localStorage.setItem('pug:lastProjectByOrg', JSON.stringify({ 'org-a': 'a2' }))
    vi.resetModules()

    const { lastProjectByOrgAtom: freshAtom, rememberLastProjectAtom } = await import('./workspace.atoms')
    const store = createStore()

    // The stored shape carries no customerId, so it can't match one. Reading it back as some
    // account's visits would hand every account the same stale pick.
    expect(store.get(freshAtom)).toEqual({})

    // And the first write replaces it outright rather than leaving it alongside — no second shape
    // under this key waiting for the next reader.
    store.set(rememberLastProjectAtom, { orgId: 'org-a', projectId: 'a1' })
    expect(JSON.parse(localStorage.getItem('pug:lastProjectByOrg') ?? '{}')).toEqual({
      customerId: 'cust-1',
      byOrg: { 'org-a': 'a1' },
    })
  })
})
