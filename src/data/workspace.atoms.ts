import type { Org } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'
import { atom } from 'jotai'

// Orgs
export const orgsAtom = atom<Org[]>([])

export const fetchOrgsAtom = atom(null, async (get, set) => {
  const orgsRPC = get(orgsRPCAtom)
  try {
    const resp = await orgsRPC.list({})
    set(orgsAtom, resp.orgs)
    return resp.orgs
  } catch (err) {
    console.error('fetchOrgs failed:', err)
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
    return resp.projects
  } catch (err) {
    console.error('fetchProjects failed:', err)
    return []
  }
})

export const activeProjectAtom = atom<Project | null>(null)

export const createProjectAtom = atom(null, async (get, set, displayName: string) => {
  const org = get(activeOrgAtom)
  if (!org) return
  const projectsRPC = get(projectsRPCAtom)
  const resp = await projectsRPC.create({ displayName, orgId: org.id })
  const refreshed = await projectsRPC.batchGet({ orgId: org.id })
  set(projectsAtom, refreshed.projects)
  if (resp.project) set(activeProjectAtom, resp.project)
})

// Project-scoped header (auth is handled by interceptor)
export const projectHeaderAtom = atom(get => {
  const project = get(activeProjectAtom)
  if (!project) return undefined
  return { 'x-project-id': project.id }
})
