import { create } from '@bufbuild/protobuf'
import { atom } from 'jotai'
import type { Dashboard, DashboardsServiceUpsertRequest } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  DashboardsServiceDeleteRequestSchema,
  DashboardsServiceUpdateRequestSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { dashboardsRPCAtom } from '@/api/rpc'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'

export const dashboardListAtom = atom<Dashboard[]>([])
export const dashboardListLoadingAtom = atom(false)
export const dashboardListErrorAtom = atom<string | null>(null)

export const fetchDashboardsAtom = atom(null, async (get, set) => {
  const project = get(activeProjectAtom)
  const headers = get(projectHeaderAtom)
  if (!project || !headers) {
    set(dashboardListAtom, [])
    set(dashboardListLoadingAtom, false)
    set(dashboardListErrorAtom, null)
    return []
  }

  const dashboardsRPC = get(dashboardsRPCAtom)
  const requestedProjectId = project.id
  set(dashboardListLoadingAtom, true)
  set(dashboardListErrorAtom, null)
  try {
    const resp = await dashboardsRPC.list({}, { headers })
    if (get(activeProjectAtom)?.id !== requestedProjectId) return []
    set(dashboardListAtom, resp.dashboards)
    return resp.dashboards
  } catch (err) {
    if (get(activeProjectAtom)?.id !== requestedProjectId) return []
    console.error('fetchDashboards failed:', err)
    set(dashboardListAtom, [])
    set(dashboardListErrorAtom, 'Failed to load dashboards')
    return []
  } finally {
    if (get(activeProjectAtom)?.id === requestedProjectId) {
      set(dashboardListLoadingAtom, false)
    }
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
