import type { Org } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'
import { atom } from 'jotai'

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
    set(workspaceErrorAtom, 'Failed to load your workspace. Please check your connection and try again.')
    return []
  }
})

export const activeOrgAtom = atom<Org | null>(null)

// Projects
export const projectsAtom = atom<Project[]>([])

export const fetchProjectsAtom = atom(null, async (get, set) => {
  const org = get(activeOrgAtom)
  if (!org) return []
  const projectsRPC = get(projectsRPCAtom)
  try {
    const resp = await projectsRPC.batchGet({ orgId: org.id })
    set(projectsAtom, resp.projects)
    set(workspaceErrorAtom, null)
    return resp.projects
  } catch (err) {
    console.error('fetchProjects failed:', err)
    set(workspaceErrorAtom, 'Failed to load projects. Please check your connection and try again.')
    return []
  }
})

export const activeProjectAtom = atom<Project | null>(null)

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

// Project-scoped header (auth is handled by interceptor)
export const projectHeaderAtom = atom(get => {
  const project = get(activeProjectAtom)
  if (!project) return undefined
  return { 'x-project-id': project.id }
})
