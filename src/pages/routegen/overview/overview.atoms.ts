import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { trackFeature } from '@/analytics/pug'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'
import { type Bindings, pickBindings } from './tile-bindings'
import type { OverviewMode } from './url-state'

// A durable per-browser preference (like theme) rather than URL state, so it survives reloads and
// stays out of shared links. getOnInit puts the stored value on the first synchronous render: the
// overview page seeds its time-range window from the mode in a useState initializer.
//
// Typed as the string it actually is: browsers that used the view before the rename hold 'web', so
// reading it as an OverviewMode would type-lie.
const storedOverviewModeAtom = atomWithStorage('pug:overviewMode', 'traffic', undefined, {
  getOnInit: true,
})

const isOverviewMode = (value: string): value is OverviewMode => value === 'traffic' || value === 'product'

// Ids predate the web → traffic rename; renaming one would end the shipped series and restart it at
// zero with no backfill, so only the name follows the UI.
const MODE_FEATURE_ID: Record<OverviewMode, string> = { traffic: 'overview.mode.web', product: 'overview.mode.product' }

export const overviewModeAtom = atom(
  get => {
    const stored = get(storedOverviewModeAtom)
    return isOverviewMode(stored) ? stored : 'traffic'
  },
  (_get, set, next: OverviewMode) => {
    // On the atom rather than the toggle, so any future entry point counts too.
    trackFeature({ featureId: MODE_FEATURE_ID[next], featureName: `Switch to ${next} analytics` })
    set(storedOverviewModeAtom, next)
  },
)

export const overviewSchemaAtom = atom<GetFilterSchemaResponse | null>(null)
export const overviewSchemaErrorAtom = atom<string | null>(null)

export const fetchOverviewSchemaAtom = atom(null, async (get, set) => {
  const insightsRPC = get(insightsRPCAtom)
  const headers = get(projectHeaderAtom)
  const requestedProjectId = get(activeProjectAtom)?.id
  // Never a bare return: the page reads a null schema as "still loading", so an exit that writes
  // neither a schema nor an error strands it on a spinner it can't leave.
  if (!headers) {
    set(overviewSchemaAtom, null)
    set(overviewSchemaErrorAtom, 'No project selected')
    return
  }
  set(overviewSchemaErrorAtom, null)
  // Drop the previous project's schema so tile queries don't fire with stale bindings
  // during the project-switch roundtrip; the page shows its loading state until the
  // new schema lands.
  set(overviewSchemaAtom, null)
  // A response outlives the request that asked for it: switch project mid-flight and the loser
  // lands its schema under the winner, binding tiles to another project's events.
  const stale = () => get(activeProjectAtom)?.id !== requestedProjectId
  try {
    const resp = await insightsRPC.getFilterSchema({}, { headers })
    if (stale()) return
    set(overviewSchemaAtom, resp)
  } catch (err) {
    if (stale()) return
    // State before the toast: if the notifier throws, the page must still have an error to show.
    set(overviewSchemaErrorAtom, 'Failed to load project overview')
    set(overviewSchemaAtom, null)
    toastRPCError(err, 'Failed to load project overview')
  }
})

// Background refresh for the setup screen's poll. Unlike fetchOverviewSchemaAtom it doesn't clear
// the schema first, so the setup screen stays put (no spinner flash between ticks). Returns whether
// the fetch succeeded: the poll ignores a miss, "Check now" reports it.
export const pollOverviewSchemaAtom = atom(null, async (get, set) => {
  const insightsRPC = get(insightsRPCAtom)
  const headers = get(projectHeaderAtom)
  const requestedProjectId = get(activeProjectAtom)?.id
  if (!headers) return false
  try {
    const resp = await insightsRPC.getFilterSchema({}, { headers })
    if (get(activeProjectAtom)?.id !== requestedProjectId) return false
    set(overviewSchemaAtom, resp)
    return true
  } catch (err) {
    console.error('overview schema poll failed', err)
    return false
  }
})

export const overviewBindingsAtom = atom<Bindings | null>(get => {
  const schema = get(overviewSchemaAtom)
  if (!schema) return null
  return pickBindings(schema.events)
})
