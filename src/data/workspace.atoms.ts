import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Org } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'
import { customerIdAtom } from '@/auth/jwt.atoms'
import { browserTimezone } from '@/lib/timezone'

// Task 2: lastOrgIdAtom — synchronous initial read avoids first-render flash
export const LAST_ORG_ID_KEY = 'pug:lastOrgId'

const storedLastOrgId = (() => {
  try {
    const raw = localStorage.getItem(LAST_ORG_ID_KEY)
    return raw ? (JSON.parse(raw) as string) : ''
  } catch (err) {
    console.error('Failed to read stored lastOrgId:', err)
    return ''
  }
})()

export const lastOrgIdAtom = atomWithStorage(LAST_ORG_ID_KEY, storedLastOrgId)

// Orgs
export const orgsAtom = atom<Org[]>([])
export const workspaceErrorAtom = atom<string | null>(null)

export const fetchOrgsAtom = atom(null, async (get, set) => {
  const orgsRPC = get(orgsRPCAtom)
  try {
    const resp = await orgsRPC.list({})
    set(orgsAtom, resp.orgs)
    set(workspaceErrorAtom, null)
    return resp.orgs
  } catch (err) {
    console.error('fetchOrgs failed:', err)
    set(orgsAtom, [])
    set(activeOrgAtom, null)
    set(projectsAtom, [])
    set(activeProjectAtom, null)
    set(projectsOrgIdAtom, null)
    set(workspaceErrorAtom, 'Failed to load your workspace. Please check your connection and try again.')
    return []
  }
})

// Refreshes the list for a session that already has a workspace (the sidebar switcher). Not
// fetchOrgsAtom: that one tears the workspace down on failure, which is right for bootstrap and
// would put every session one flaky list call from the error screen. Here a failure just means stale.
export const refreshOrgsAtom = atom(null, async (get, set) => {
  const orgsRPC = get(orgsRPCAtom)
  try {
    const resp = await orgsRPC.list({})
    set(orgsAtom, resp.orgs)
    return resp.orgs
  } catch (err) {
    console.error('refreshOrgs failed:', err)
    return get(orgsAtom)
  }
})

// Task 3: loadOrgAtom — fetch a single org by ID and set it as active
export const loadOrgAtom = atom(null, async (get, set, orgId: string) => {
  if (!orgId) return null
  const orgsRPC = get(orgsRPCAtom)
  try {
    const resp = await orgsRPC.get({ orgId })
    if (!resp.org) return null
    set(activeOrgAtom, resp.org)
    return resp.org
  } catch (err) {
    console.error('loadOrg failed:', err)
    return null
  }
})

export const activeOrgAtom = atom<Org | null>(null)

// Task 4: selectOrgAtom — sets active org and persists its ID for next session
export const selectOrgAtom = atom(null, (_get, set, org: Org) => {
  set(activeOrgAtom, org)
  set(lastOrgIdAtom, org.id)
  // Switching org invalidates the current project context (mirrors leaveOrgAtom).
  set(activeProjectAtom, null)
  set(projectsAtom, [])
  set(projectsOrgIdAtom, null)
})

// Task 5: bootstrapStatusAtom — tracks the org-bootstrap lifecycle
export type BootstrapStatus = 'idle' | 'loading-org' | 'needs-selection' | 'ready' | 'error'

export const bootstrapStatusAtom = atom<BootstrapStatus>('idle')

// Projects
export const projectsAtom = atom<Project[]>([])

// Which org's project list is loaded, or null while a fetch is in flight or none has run. An empty
// `projectsAtom` can't answer that on its own — it means both "not fetched yet" and "this org has no
// projects", and only the first is worth waiting on. A failed fetch counts as loaded: see the catch
// in fetchProjectsAtom.
//
// Keyed by org rather than a loaded/loading boolean because switching org then invalidates it
// without anyone remembering to — the key simply stops matching. That covers switches, NOT teardowns
// that return to the same org: sign out and back in, and a boolean and a key are equally stale. So
// every path that clears `projectsAtom` clears this beside it. Module-private to keep that pairing
// enforceable here; null rather than '' so it can't collide with an Org's own proto-default id.
const projectsOrgIdAtom = atom<string | null>(null)

export const fetchProjectsAtom = atom(null, async (get, set) => {
  const org = get(activeOrgAtom)
  if (!org) {
    set(projectsAtom, [])
    set(activeProjectAtom, null)
    set(projectsOrgIdAtom, null)
    return []
  }
  // Clear stale projects before the await so the previous org's projects
  // don't briefly leak through (e.g. when switching orgs from settings).
  set(projectsAtom, [])
  set(activeProjectAtom, null)
  set(projectsOrgIdAtom, null)
  const projectsRPC = get(projectsRPCAtom)
  // A response outlives the request that asked for it: switch org — or sign out — while batchGet is
  // in flight and it resolves into a workspace that has moved on. Committing then doesn't just write
  // the wrong org's list, it keys that list to the org now active, and projectsOrgIdAtom saying "this
  // org's projects have landed" is the one claim workspaceSettledAtom trusts. Drop the response
  // instead: whatever moved the org has already started the fetch that answers for it.
  const stale = () => get(activeOrgAtom)?.id !== org.id
  try {
    const resp = await projectsRPC.batchGet({ orgId: org.id })
    if (stale()) return []
    set(projectsAtom, resp.projects)
    set(projectsOrgIdAtom, org.id)
    set(workspaceErrorAtom, null)
    return resp.projects
  } catch (err) {
    console.error('fetchProjects failed:', err)
    if (stale()) return []
    set(projectsAtom, [])
    set(activeProjectAtom, null)
    // The list is as resolved as it will get: a failure is a settled answer, not a pending one.
    set(projectsOrgIdAtom, org.id)
    set(workspaceErrorAtom, 'Failed to load projects. Please check your connection and try again.')
    return []
  }
})

export const activeProjectAtom = atom<Project | null>(null)

// Whether the active org's project list has landed. Read-only view of projectsOrgIdAtom, which stays
// module-private so its writes keep their pairing — the ambiguity it resolves ("no projects" vs "not
// fetched yet") is one rendering code needs too, or an org with none is indistinguishable from one
// still loading and gets a spinner that never ends.
export const projectsLoadedAtom = atom(get => {
  const org = get(activeOrgAtom)
  return !!org && get(projectsOrgIdAtom) === org.id
})

// True once the org and project have stopped resolving on their own — bootstrap has either finished
// picking them or reached a state where it never will.
//
// A load walks through several honest-but-incomplete states (no org → org → org + project) a render
// apart. Anything that *reports* workspace state rather than merely rendering it has to wait for the
// end of that walk, or it reports each step as though it were the answer; analytics is the consumer
// this exists for. Rendering code wants the intermediate states and should keep reading the
// individual atoms.
//
// Only trustworthy while WorkspaceBootstrap is mounted: 'idle' means "bootstrap hasn't started",
// which from here is indistinguishable from "no bootstrap is coming" (the shared-dashboard route
// mounts neither). App owns that distinction and passes it down.
//
// It also can't see ProjectSync adopting the URL's project, which happens after this reports
// settled. What keeps that honest is App's bootstrap declining to default-pick when the route names
// a project, so there's only ever one pick — - remove that and this quietly under-reports again.
export const workspaceSettledAtom = atom(get => {
  const status = get(bootstrapStatusAtom)
  // The org picker counts as settled only while it's still waiting on the user: selectOrg sets the
  // org a render before the status reaches 'ready', and settling in that window spends a report on
  // traits that are a strict subset of the ones one render away.
  if (status === 'needs-selection') return !get(activeOrgAtom)
  if (status !== 'ready') return status === 'error'
  const org = get(activeOrgAtom)
  if (!org || get(projectsOrgIdAtom) !== org.id) return false
  // The list has landed; the pick follows a render later. An org with no projects has no pick coming.
  return get(projectsAtom).length === 0 || get(activeProjectAtom) !== null
})

// Last project visited per org (orgId → projectId) for the signed-in customer, restored when
// switching orgs and when a bare URL leaves the project unnamed.
//
// Stamped with the customer it belongs to because one browser outlives one account: under an org key
// alone, two accounts sharing an org share one entry, so the second lands on the first's project and
// then overwrites it. One slot rather than a slice per account — one customer per browser is the
// assumption, so a second account's visits are forgotten rather than kept forever in a roster
// nothing trims. The stamp retires the earlier unstamped shapes for free: they carry no customerId,
// so they can't match one and read as no visits, and the first write replaces them outright.
//
// getOnInit because the restore loses a race without it: atomWithStorage otherwise starts at the
// initial value and only reads storage in onMount, so an early reader sees {} and defaults to the
// first project — and once that default lands it *is* a valid pick, so the stored one never gets
// another chance. (lastOrgIdAtom above buys the same guarantee by hand, predating this option.)
// Not sufficient on its own: the customer id has to land synchronously too, which is why jwtAtom
// pre-reads localStorage at module scope rather than deferring to onMount (see jwt.atoms).
const lastProjectAtom = atomWithStorage<{ customerId: string; byOrg: Record<string, string> }>(
  'pug:lastProjectByOrg',
  { customerId: '', byOrg: {} },
  undefined,
  { getOnInit: true },
)

// The signed-in customer's visits, or none when the stored ones belong to someone else.
export const lastProjectByOrgAtom = atom<Record<string, string>>(get => {
  const customerId = get(customerIdAtom)
  if (!customerId) return {}
  const stored = get(lastProjectAtom)
  return stored.customerId === customerId ? stored.byOrg : {}
})

// Record a visit against the signed-in customer: the stamp comes from the session, not the caller.
export const rememberLastProjectAtom = atom(
  null,
  (get, set, { orgId, projectId }: { orgId: string; projectId: string }) => {
    const customerId = get(customerIdAtom)
    if (!customerId) return
    const byOrg = get(lastProjectByOrgAtom)
    if (byOrg[orgId] === projectId) return
    set(lastProjectAtom, { customerId, byOrg: { ...byOrg, [orgId]: projectId } })
  },
)

export const createProjectAtom = atom(null, async (get, set, displayName: string) => {
  const org = get(activeOrgAtom)
  if (!org) return null
  const projectsRPC = get(projectsRPCAtom)
  // Inherit the creator's browser zone (coerced to UTC server-side if malformed);
  // adjust per-project later in settings.
  const resp = await projectsRPC.create({ displayName, orgId: org.id, reportingTimezone: browserTimezone() })
  // Refresh the project list — if this fails, the project was still created server-side
  try {
    const refreshed = await projectsRPC.batchGet({ orgId: org.id })
    set(projectsAtom, refreshed.projects)
  } catch (err) {
    console.error('Project created but list refresh failed:', err)
  }
  if (resp.project) set(activeProjectAtom, resp.project)
  return resp.project ?? null
})

// Task 6: createOrgAtom / leaveOrgAtom
export const createOrgAtom = atom(null, async (get, set, displayName: string) => {
  const orgsRPC = get(orgsRPCAtom)
  const resp = await orgsRPC.create({ displayName })
  if (!resp.org) return null
  // Push to the list first so the new org is in `orgsAtom` before any
  // subscriber sees it as the active org.
  set(orgsAtom, [...get(orgsAtom), resp.org])
  set(selectOrgAtom, resp.org)
  return resp.org
})

// Owns the rename rather than leaving it to the page: the name lives in two places, and updating
// activeOrgAtom alone leaves the switcher listing the old one until the next refresh.
export const renameOrgAtom = atom(
  null,
  async (get, set, { orgId, displayName }: { orgId: string; displayName: string }) => {
    const orgsRPC = get(orgsRPCAtom)
    await orgsRPC.updateDisplayName({ orgId, displayName })
    const active = get(activeOrgAtom)
    if (active?.id === orgId) set(activeOrgAtom, { ...active, displayName })
    set(
      orgsAtom,
      get(orgsAtom).map(org => (org.id === orgId ? { ...org, displayName } : org)),
    )
  },
)

export const leaveOrgAtom = atom(null, async (get, set, orgId: string) => {
  const orgsRPC = get(orgsRPCAtom)
  await orgsRPC.leave({ orgId })
  set(
    orgsAtom,
    get(orgsAtom).filter(o => o.id !== orgId),
  )
  set(activeOrgAtom, null)
  set(lastOrgIdAtom, '')
  set(activeProjectAtom, null)
  set(projectsAtom, [])
  set(projectsOrgIdAtom, null)
  set(bootstrapStatusAtom, 'idle')
})

// Project-scoped header (auth is handled by interceptor)
export const projectHeaderAtom = atom(get => {
  const project = get(activeProjectAtom)
  if (!project) return undefined
  return { 'x-project-id': project.id }
})

// The project's reporting timezone, used to render bucketed insight/dashboard
// times in the same zone the server bucketed them. `'UTC'` is a valid Intl zone
// and the right default when the project stores `''` (the server's canonical UTC).
export const activeProjectTimezoneAtom = atom(get => get(activeProjectAtom)?.reportingTimezone || 'UTC')

// Task 7: resetWorkspaceAtom — also clears lastOrgId and resets bootstrap status
export const resetWorkspaceAtom = atom(null, (_, set) => {
  set(orgsAtom, [])
  set(activeOrgAtom, null)
  set(projectsAtom, [])
  set(activeProjectAtom, null)
  set(projectsOrgIdAtom, null)
  set(workspaceErrorAtom, null)
  set(lastOrgIdAtom, '')
  set(bootstrapStatusAtom, 'idle')
})
