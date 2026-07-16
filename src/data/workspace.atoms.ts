import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Org } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'
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
    set(workspaceErrorAtom, 'Failed to load your workspace. Please check your connection and try again.')
    return []
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
})

// Task 5: bootstrapStatusAtom — tracks the org-bootstrap lifecycle
export type BootstrapStatus = 'idle' | 'loading-org' | 'needs-selection' | 'ready' | 'error'

export const bootstrapStatusAtom = atom<BootstrapStatus>('idle')

// Projects
export const projectsAtom = atom<Project[]>([])

// Which org the loaded project list belongs to, or '' while a fetch is in flight or none has run.
// An empty `projectsAtom` can't answer that on its own — it means both "not fetched yet" and "this
// org has no projects", and only the first is worth waiting on. Keyed by org rather than a
// loaded/loading boolean so that every path which changes the active org invalidates it for free:
// there is no flag for a future switch path to forget to reset.
export const projectsOrgIdAtom = atom('')

export const fetchProjectsAtom = atom(null, async (get, set) => {
  const org = get(activeOrgAtom)
  if (!org) {
    set(projectsAtom, [])
    set(activeProjectAtom, null)
    set(projectsOrgIdAtom, '')
    return []
  }
  // Clear stale projects before the await so the previous org's projects
  // don't briefly leak through (e.g. when switching orgs from settings).
  set(projectsAtom, [])
  set(activeProjectAtom, null)
  set(projectsOrgIdAtom, '')
  const projectsRPC = get(projectsRPCAtom)
  try {
    const resp = await projectsRPC.batchGet({ orgId: org.id })
    set(projectsAtom, resp.projects)
    set(projectsOrgIdAtom, org.id)
    set(workspaceErrorAtom, null)
    return resp.projects
  } catch (err) {
    console.error('fetchProjects failed:', err)
    set(projectsAtom, [])
    set(activeProjectAtom, null)
    // The list is as resolved as it will get: a failure is a settled answer, not a pending one.
    set(projectsOrgIdAtom, org.id)
    set(workspaceErrorAtom, 'Failed to load projects. Please check your connection and try again.')
    return []
  }
})

export const activeProjectAtom = atom<Project | null>(null)

// True once the org and project have stopped resolving on their own — bootstrap either finished
// picking them or reached a state where it never will (no org to select, or a hard failure).
//
// This exists because a load walks through several honest-but-incomplete states (no org → org →
// org + project), one render apart, and anything that *reports* on workspace state rather than
// merely rendering it would otherwise report each one. Analytics is that consumer: without this it
// sent an identify per intermediate state, three per page load. Rendering code wants the
// intermediate states and should keep reading the individual atoms.
//
// A caller must only trust this while WorkspaceBootstrap is mounted — 'idle' means "bootstrap
// hasn't started", which is indistinguishable from "no bootstrap is coming" (the shared-dashboard
// route mounts neither). App owns that distinction and passes it down.
export const workspaceSettledAtom = atom(get => {
  const status = get(bootstrapStatusAtom)
  if (status !== 'ready') return status === 'needs-selection' || status === 'error'
  const org = get(activeOrgAtom)
  if (!org || get(projectsOrgIdAtom) !== org.id) return false
  // The list has landed; the pick follows a render later. An org with no projects has no pick coming.
  return get(projectsAtom).length === 0 || get(activeProjectAtom) !== null
})

// Last project visited per org (orgId → projectId), restored when switching orgs.
export const lastProjectByOrgAtom = atomWithStorage<Record<string, string>>('pug:lastProjectByOrg', {})

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
  set(workspaceErrorAtom, null)
  set(lastOrgIdAtom, '')
  set(bootstrapStatusAtom, 'idle')
})
