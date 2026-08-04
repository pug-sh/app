import type { LayoutItem } from 'react-grid-layout/legacy'
import { DashboardGridMode as DashboardGridModeProto } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'

// Positions are stored in the API's original 72-unit coordinate system so this
// UI improvement stays wire-compatible with existing dashboards and servers.
// The editor renders those positions on a familiar 12-column grid.
export const STORED_GRID_COLUMNS = 72
export const DISPLAY_GRID_COLUMNS = 12
export const GRID_UNIT_SCALE = STORED_GRID_COLUMNS / DISPLAY_GRID_COLUMNS

export type DashboardGridMode = 'free' | 'columns-12'

export const dashboardGridModeFromProto = (mode: DashboardGridModeProto): DashboardGridMode =>
  mode === DashboardGridModeProto.COLUMNS_12 ? 'columns-12' : 'free'

export const dashboardGridModeToProto = (mode: DashboardGridMode): DashboardGridModeProto =>
  mode === 'columns-12' ? DashboardGridModeProto.COLUMNS_12 : DashboardGridModeProto.FREE

type Position = Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>

export const storedPositionToDisplay = ({ x, y, w, h }: Position): Position => {
  const displayX = Math.max(0, Math.min(DISPLAY_GRID_COLUMNS - 1, Math.round(x / GRID_UNIT_SCALE)))
  const storedRight = Math.max(x + 1, x + w)
  const displayRight = Math.max(displayX + 1, Math.min(DISPLAY_GRID_COLUMNS, Math.round(storedRight / GRID_UNIT_SCALE)))

  return { x: displayX, y, w: displayRight - displayX, h }
}

export const displayPositionToStored = ({ x, y, w, h }: Position): Position => ({
  x: x * GRID_UNIT_SCALE,
  y,
  w: w * GRID_UNIT_SCALE,
  h,
})

// Free mode speaks the API's native 72-unit coordinate system directly. The
// standard mode only translates at the grid boundary, so changing the selector
// never mutates a dashboard by itself.
export const storedPositionForGrid = (position: Position, mode: DashboardGridMode): Position =>
  mode === 'columns-12' ? storedPositionToDisplay(position) : position

export const gridPositionForStorage = (position: Position, mode: DashboardGridMode): Position =>
  mode === 'columns-12' ? displayPositionToStored(position) : position
