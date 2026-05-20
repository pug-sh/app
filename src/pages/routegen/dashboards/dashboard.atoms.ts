import { create } from '@bufbuild/protobuf'
import { atom } from 'jotai'
import type {
  Dashboard,
  DashboardsServiceCreateTileRequest,
  DashboardsServiceUpdateTileRequest,
  DashboardTile,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  DashboardsServiceDeleteRequestSchema,
  DashboardsServiceDeleteTileRequestSchema,
  DashboardsServiceUpdateDisplayNameRequestSchema,
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

export const createDashboardAtom = atom(null, async (get, set, input: { displayName: string; description: string }) => {
  const headers = get(projectHeaderAtom)
  if (!headers) return null

  const dashboardsRPC = get(dashboardsRPCAtom)
  const resp = await dashboardsRPC.create(input, { headers })
  await set(fetchDashboardsAtom)
  return resp.dashboard ?? null
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

export const updateDashboardAtom = atom(
  null,
  async (get, set, input: { id: string; displayName: string; description: string }) => {
    const headers = get(projectHeaderAtom)
    if (!headers) return null

    const dashboardsRPC = get(dashboardsRPCAtom)
    const resp = await dashboardsRPC.updateDisplayName(create(DashboardsServiceUpdateDisplayNameRequestSchema, input), {
      headers,
    })
    await set(fetchDashboardsAtom)
    return resp.dashboard ?? null
  },
)

export const createDashboardTileAtom = atom(null, async (get, set, input: DashboardsServiceCreateTileRequest) => {
  const headers = get(projectHeaderAtom)
  if (!headers) return null

  const dashboardsRPC = get(dashboardsRPCAtom)
  const resp = await dashboardsRPC.createTile(input, { headers })
  await set(fetchDashboardsAtom)
  return resp.tile ?? null
})

export const updateDashboardTileAtom = atom(null, async (get, _set, input: DashboardsServiceUpdateTileRequest) => {
  const headers = get(projectHeaderAtom)
  if (!headers) return null

  const dashboardsRPC = get(dashboardsRPCAtom)
  const resp = await dashboardsRPC.updateTile(input, { headers })
  return resp.tile ?? null
})

export const deleteDashboardTileAtom = atom(null, async (get, _set, input: { id: string; dashboardId: string }) => {
  const headers = get(projectHeaderAtom)
  if (!headers) return

  const dashboardsRPC = get(dashboardsRPCAtom)
  await dashboardsRPC.deleteTile(create(DashboardsServiceDeleteTileRequestSchema, input), { headers })
})

export const replaceDashboardTile = (dashboard: Dashboard, nextTile: DashboardTile) => ({
  ...dashboard,
  tiles: dashboard.tiles.map(tile => (tile.id === nextTile.id ? nextTile : tile)),
})

export const appendDashboardTile = (dashboard: Dashboard, nextTile: DashboardTile) => ({
  ...dashboard,
  tiles: [...dashboard.tiles, nextTile],
})

export const removeDashboardTile = (dashboard: Dashboard, tileId: string) => ({
  ...dashboard,
  tiles: dashboard.tiles.filter(tile => tile.id !== tileId),
})
