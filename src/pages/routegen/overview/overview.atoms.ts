import { atom } from 'jotai'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'
import { type Bindings, pickBindings } from './tile-bindings'

export const overviewSchemaAtom = atom<GetFilterSchemaResponse | null>(null)
export const overviewSchemaLoadingAtom = atom(false)
export const overviewSchemaErrorAtom = atom<string | null>(null)

export const fetchOverviewSchemaAtom = atom(null, async (get, set) => {
  const insightsRPC = get(insightsRPCAtom)
  const headers = get(projectHeaderAtom)
  if (!headers) return
  set(overviewSchemaLoadingAtom, true)
  set(overviewSchemaErrorAtom, null)
  try {
    const resp = await insightsRPC.getFilterSchema({}, { headers })
    set(overviewSchemaAtom, resp)
  } catch (err) {
    toastRPCError(err, 'Failed to load project overview')
    set(overviewSchemaErrorAtom, 'Failed to load project overview')
    set(overviewSchemaAtom, null)
  } finally {
    set(overviewSchemaLoadingAtom, false)
  }
})

export const overviewBindingsAtom = atom<Bindings | null>(get => {
  const schema = get(overviewSchemaAtom)
  if (!schema) return null
  return pickBindings(schema.events)
})
