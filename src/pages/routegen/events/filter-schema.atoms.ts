import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { atom } from 'jotai'

export const filterSchemaAtom = atom<GetFilterSchemaResponse | null>(null)
export const filterSchemaErrorAtom = atom<string | null>(null)
export const filterSchemaProjectIdAtom = atom<string | null>(null)

export const fetchFilterSchemaAtom = atom(null, async (get, set, kindFilter?: string) => {
  const project = get(activeProjectAtom)
  if (!project) {
    set(filterSchemaAtom, null)
    set(filterSchemaErrorAtom, null)
    set(filterSchemaProjectIdAtom, null)
    return null
  }

  const insightsRPC = get(insightsRPCAtom)
  const headers = get(projectHeaderAtom)
  const requestedProjectId = project.id
  set(filterSchemaErrorAtom, null)
  set(filterSchemaAtom, null)
  set(filterSchemaProjectIdAtom, requestedProjectId)
  try {
    const resp = await insightsRPC.getFilterSchema({ eventKind: kindFilter ?? '' }, { headers })
    if (get(activeProjectAtom)?.id !== requestedProjectId) return null
    set(filterSchemaAtom, resp)
    return resp
  } catch (err) {
    if (get(activeProjectAtom)?.id !== requestedProjectId) return null
    const message = err instanceof Error ? err.message : 'Failed to load filter schema'
    console.error('fetchFilterSchema failed:', err)
    set(filterSchemaAtom, null)
    set(filterSchemaErrorAtom, message)
    return null
  }
})
