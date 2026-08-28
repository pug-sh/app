import { create } from '@bufbuild/protobuf'
import { atom, type Getter } from 'jotai'
import { trackFeature } from '@/analytics/pug'
import type { Dashboard, DashboardsServiceUpsertRequest } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  DashboardsServiceDeleteRequestSchema,
  DashboardsServiceUpdateRequestSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { dashboardsRPCAtom } from '@/api/rpc'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'

type DashboardListState = {
  projectId: string
  dashboards: Dashboard[] | null
  error: string | null
}

const dashboardListStateAtom = atom<DashboardListState | null>(null)

// Two rules, both mirroring the overview schema. Null dashboards means "not answered yet": an
// in-flight flag reads false on the first commit and flashes the empty state over a project that
// has dashboards. And the state is owned by the project it was fetched for, because the page
// remounts on a switch while this module-level atom doesn't — an ungated read would show the
// previous project's rows under the new one.
const ownedState = (get: Getter) => {
  const state = get(dashboardListStateAtom)
  return state?.projectId === get(activeProjectAtom)?.id ? state : null
}

export const dashboardListAtom = atom(get => ownedState(get)?.dashboards ?? null)
export const dashboardListErrorAtom = atom(get => ownedState(get)?.error ?? null)

export const fetchDashboardsAtom = atom(null, async (get, set) => {
  const headers = get(projectHeaderAtom)
  const projectId = get(activeProjectAtom)?.id
  // Safe to leave the state alone: with no project the page renders NoProject, and anything left
  // over from the last one is already gated out by ownership.
  if (!headers || !projectId) return []

  const dashboardsRPC = get(dashboardsRPCAtom)
  // Carries the current list forward so a refetch after create/delete doesn't blank the page; on a
  // switch the owned read is already null, which is what puts the spinner up.
  set(dashboardListStateAtom, { projectId, dashboards: get(dashboardListAtom), error: null })
  // A response outlives the request that asked for it, and the loser lands last: without this a
  // late reply for the old project overwrites the new one's and the page never leaves the spinner.
  const stale = () => get(activeProjectAtom)?.id !== projectId
  try {
    const resp = await dashboardsRPC.list({}, { headers })
    if (stale()) return []
    set(dashboardListStateAtom, { projectId, dashboards: resp.dashboards, error: null })
    return resp.dashboards
  } catch (err) {
    if (stale()) return []
    console.error('fetchDashboards failed:', err)
    set(dashboardListStateAtom, { projectId, dashboards: [], error: 'Failed to load dashboards' })
    return []
  }
})

// One-shot signal: holds the id of a just-created dashboard so the detail page
// can open it directly in edit mode. Consumed (reset to null) on first read.
export const pendingEditDashboardIdAtom = atom<string | null>(null)

export const createDashboardAtom = atom(null, async (get, set, input: { displayName: string; description: string }) => {
  const headers = get(projectHeaderAtom)
  if (!headers) return null

  const dashboardsRPC = get(dashboardsRPCAtom)
  const resp = await dashboardsRPC.create(input, { headers })
  // On the atom rather than the button, so every entry point counts and a new one can't forget.
  // No displayName — that's the customer's text, and featureId already says what happened.
  trackFeature({ featureId: 'dashboard.create', featureName: 'New dashboard' })
  await set(fetchDashboardsAtom)
  const dashboard = resp.dashboard ?? null
  if (dashboard) set(pendingEditDashboardIdAtom, dashboard.id)
  return dashboard
})

export const deleteDashboardAtom = atom(null, async (get, set, id: string) => {
  const headers = get(projectHeaderAtom)
  if (!headers || !id) return []

  const dashboardsRPC = get(dashboardsRPCAtom)
  await dashboardsRPC.delete(create(DashboardsServiceDeleteRequestSchema, { id }), { headers })
  // The delete control is an icon-only, hover-revealed row action — click autocapture reports it
  // as tag `svg` with no text, so without this the click is unattributable.
  trackFeature({ featureId: 'dashboard.delete', featureName: 'Delete dashboard' })
  return (await set(fetchDashboardsAtom)) ?? []
})

export const fetchDashboardAtom = atom(null, async (get, _set, id: string) => {
  const headers = get(projectHeaderAtom)
  if (!headers || !id) return null

  const dashboardsRPC = get(dashboardsRPCAtom)
  const resp = await dashboardsRPC.get({ id }, { headers })
  return resp.dashboard ?? null
})

// Toggle public sharing. The backend mints/clears Dashboard.shareId based on
// isPublic. Sends the current saved metadata (update overwrites it), never an
// unsaved draft — the caller passes the server-fetched dashboard.
export const setDashboardVisibilityAtom = atom(
  null,
  async (get, _set, input: { dashboard: Dashboard; isPublic: boolean }) => {
    const headers = get(projectHeaderAtom)
    if (!headers) throw new Error('No active project')

    const dashboardsRPC = get(dashboardsRPCAtom)
    const resp = await dashboardsRPC.update(
      create(DashboardsServiceUpdateRequestSchema, {
        id: input.dashboard.id,
        displayName: input.dashboard.displayName,
        description: input.dashboard.description,
        defaultTimeRange: input.dashboard.defaultTimeRange,
        defaultGranularity: input.dashboard.defaultGranularity,
        isPublic: input.isPublic,
      }),
      { headers },
    )
    if (!resp.dashboard) throw new Error('Update returned no dashboard')
    return resp.dashboard
  },
)

export const upsertDashboardAtom = atom(null, async (get, _set, input: DashboardsServiceUpsertRequest) => {
  const headers = get(projectHeaderAtom)
  if (!headers) throw new Error('No active project')

  const dashboardsRPC = get(dashboardsRPCAtom)
  const resp = await dashboardsRPC.upsert(input, { headers })
  if (!resp.dashboard) throw new Error('Upsert returned no dashboard')
  return resp.dashboard
})
