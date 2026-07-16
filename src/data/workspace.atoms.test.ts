import { create } from '@bufbuild/protobuf'
import { createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'

const { batchGet, orgsList, orgsGet } = vi.hoisted(() => ({
  batchGet: vi.fn(),
  orgsList: vi.fn(),
  orgsGet: vi.fn(),
}))

// The RPC atoms build real ConnectRPC clients over the app's transport at read time. Swap the two
// this module reads for hand-held fakes, so a test can decide when — and whether — a call resolves.
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    projectsRPCAtom: atom({ batchGet }),
    orgsRPCAtom: atom({ list: orgsList, get: orgsGet }),
  }
})

const {
  activeOrgAtom,
  activeProjectAtom,
  bootstrapStatusAtom,
  fetchProjectsAtom,
  projectsAtom,
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

describe('lastProjectByOrgAtom', () => {
  it('reads storage on init, before anything mounts it', async () => {
    localStorage.setItem('pug:lastProjectByOrg', JSON.stringify({ 'org-a': 'a2' }))
    vi.resetModules()

    // Re-imported so the atom initializes against the seeded storage: getOnInit reads at atom
    // construction, which is module scope. A plain read here would see the already-built atom.
    const { lastProjectByOrgAtom: freshAtom } = await import('./workspace.atoms')

    // No mount, no effects — the value is there at the first synchronous read, which is the whole
    // point: the default pick runs before onMount would have gotten around to loading it.
    expect(createStore().get(freshAtom)).toEqual({ 'org-a': 'a2' })
  })
})
