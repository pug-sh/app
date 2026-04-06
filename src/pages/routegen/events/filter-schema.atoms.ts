import type { GetFilterSchemaResponse } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { atom } from 'jotai'

export const filterSchemaAtom = atom<GetFilterSchemaResponse | null>(null)
export const filterSchemaErrorAtom = atom<string | null>(null)

export const fetchFilterSchemaAtom = atom(null, async (get, set, kindFilter?: string) => {
  const insightsRPC = get(insightsRPCAtom)
  const headers = get(projectHeaderAtom)
  set(filterSchemaErrorAtom, null)
  try {
    const resp = await insightsRPC.getFilterSchema({ eventKind: kindFilter ?? '' }, { headers })
    set(filterSchemaAtom, resp)
    return resp
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load filter schema'
    console.error('fetchFilterSchema failed:', err)
    set(filterSchemaErrorAtom, message)
    return null
  }
})
