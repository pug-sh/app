import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Org } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'

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

export const fetchProjectsAtom = atom(null, async (get, set) => {
  const org = get(activeOrgAtom)
  if (!org) {
    set(projectsAtom, [])
    set(activeProjectAtom, null)
    return []
  }
  // Clear stale projects before the await so the previous org's projects
  // don't briefly leak through (e.g. when switching orgs from settings).
  set(projectsAtom, [])
  set(activeProjectAtom, null)
  const projectsRPC = get(projectsRPCAtom)
  try {
    const resp = await projectsRPC.batchGet({ orgId: org.id })
    set(projectsAtom, resp.projects)
    set(workspaceErrorAtom, null)
    return resp.projects
  } catch (err) {
    console.error('fetchProjects failed:', err)
    set(projectsAtom, [])
    set(activeProjectAtom, null)
    set(workspaceErrorAtom, 'Failed to load projects. Please check your connection and try again.')
    return []
  }
})

export const activeProjectAtom = atom<Project | null>(null)

// Last project visited per org (orgId → projectId), restored when switching orgs.
export const lastProjectByOrgAtom = atomWithStorage<Record<string, string>>('pug:lastProjectByOrg', {})

export const createProjectAtom = atom(null, async (get, set, displayName: string) => {
  const org = get(activeOrgAtom)
  if (!org) return null
  const projectsRPC = get(projectsRPCAtom)
  const resp = await projectsRPC.create({ displayName, orgId: org.id })
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
