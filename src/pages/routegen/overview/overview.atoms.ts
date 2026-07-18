import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'
import { type Bindings, pickBindings } from './tile-bindings'
import type { OverviewMode } from './url-state'

// The Web vs Product analytics view is a durable personal preference (like theme), so it persists in
// localStorage rather than the URL — a chosen default that survives reloads and new tabs while staying
// out of shared links. getOnInit puts the stored value on the first synchronous render: the overview
// page seeds its initial time-range window from the mode in a useState initializer, which runs before
// any mount effect could hydrate it (the same reason isDemoSessionAtom takes the option).
export const overviewModeAtom = atomWithStorage<OverviewMode>('pug:overviewMode', 'web', undefined, {
  getOnInit: true,
})

export const overviewSchemaAtom = atom<GetFilterSchemaResponse | null>(null)
export const overviewSchemaLoadingAtom = atom(false)
export const overviewSchemaErrorAtom = atom<string | null>(null)

export const fetchOverviewSchemaAtom = atom(null, async (get, set) => {
  const insightsRPC = get(insightsRPCAtom)
  const headers = get(projectHeaderAtom)
  if (!headers) return
  set(overviewSchemaLoadingAtom, true)
  set(overviewSchemaErrorAtom, null)
  // Drop the previous project's schema so tile queries don't fire with stale bindings
  // during the project-switch roundtrip; the page shows its loading state until the
  // new schema lands.
  set(overviewSchemaAtom, null)
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

// Background refresh for the setup screen's poll. Unlike fetchOverviewSchemaAtom it neither
// clears the schema nor toggles the page-level loading flag, so the setup screen stays put (no
// spinner flash between ticks) and the page swaps to the dashboard the instant the first events
// land. Returns whether the fetch succeeded: the background poll ignores a miss (the initial load
// already surfaced schema errors, so a transient tick shouldn't toast or tear down the screen),
// while the explicit "Check now" action uses the result to tell the user when a refresh fails.
export const pollOverviewSchemaAtom = atom(null, async (get, set) => {
  const insightsRPC = get(insightsRPCAtom)
  const headers = get(projectHeaderAtom)
  if (!headers) return false
  try {
    const resp = await insightsRPC.getFilterSchema({}, { headers })
    set(overviewSchemaAtom, resp)
    return true
  } catch (err) {
    console.debug('overview schema poll failed', err)
    return false
  }
})

export const overviewBindingsAtom = atom<Bindings | null>(get => {
  const schema = get(overviewSchemaAtom)
  if (!schema) return null
  return pickBindings(schema.events)
})
