import { atom, type Getter } from 'jotai'
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

type OverviewSchemaState = {
  projectId: string
  schema: GetFilterSchemaResponse | null
  error: string | null
}

const overviewSchemaStateAtom = atom<OverviewSchemaState | null>(null)

// Owned by the project it was fetched for. The page remounts on a project switch but this
// module-level state doesn't, so an ungated read hands the first commit under the new project the
// previous one's schema — long enough for its tiles to fire queries against the wrong bindings.
const ownedState = (get: Getter) => {
  const state = get(overviewSchemaStateAtom)
  return state?.projectId === get(activeProjectAtom)?.id ? state : null
}

export const overviewSchemaAtom = atom(get => ownedState(get)?.schema ?? null)
export const overviewSchemaErrorAtom = atom(get => ownedState(get)?.error ?? null)

export const fetchOverviewSchemaAtom = atom(null, async (get, set) => {
  const insightsRPC = get(insightsRPCAtom)
  const headers = get(projectHeaderAtom)
  const projectId = get(activeProjectAtom)?.id
  // Safe to leave the state alone: with no project the page renders NoProject, and any state left
  // over from the last one is already gated out by ownership.
  if (!headers || !projectId) return
  // Asked but unanswered — a null schema is what the page reads as "still loading". Also clears a
  // same-project retry, which ownership alone wouldn't.
  set(overviewSchemaStateAtom, { projectId, schema: null, error: null })
  // A response outlives the request that asked for it, and the loser lands last: without this a
  // late reply for the old project overwrites the new one's and the page never leaves the spinner.
  const stale = () => get(activeProjectAtom)?.id !== projectId
  try {
    const resp = await insightsRPC.getFilterSchema({}, { headers })
    if (stale()) return
    set(overviewSchemaStateAtom, { projectId, schema: resp, error: null })
  } catch (err) {
    if (stale()) return
    // State before the toast: if the notifier throws, the page must still have an error to show.
    set(overviewSchemaStateAtom, { projectId, schema: null, error: 'Failed to load project overview' })
    toastRPCError(err, 'Failed to load project overview')
  }
})

// Background refresh for the setup screen's poll. Unlike fetchOverviewSchemaAtom it doesn't clear
// the schema first, so the setup screen stays put (no spinner flash between ticks). Returns whether
// the fetch succeeded: the poll ignores a miss, "Check now" reports it.
export const pollOverviewSchemaAtom = atom(null, async (get, set) => {
  const insightsRPC = get(insightsRPCAtom)
  const headers = get(projectHeaderAtom)
  const projectId = get(activeProjectAtom)?.id
  if (!headers || !projectId) return false
  try {
    const resp = await insightsRPC.getFilterSchema({}, { headers })
    if (get(activeProjectAtom)?.id !== projectId) return false
    set(overviewSchemaStateAtom, { projectId, schema: resp, error: null })
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
