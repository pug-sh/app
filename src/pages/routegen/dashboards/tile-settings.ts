import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { ViewMode } from '../insights/constants'

export const DEFAULT_DASHBOARD_TILE_VIEW_MODE = DashboardTileViewMode.LINE

export const DASHBOARD_TILE_VIEW_MODES = [
  { label: 'KPI', value: DashboardTileViewMode.KPI },
  { label: 'Line', value: DashboardTileViewMode.LINE },
  { label: 'Area', value: DashboardTileViewMode.AREA },
  { label: 'Bar (grouped)', value: DashboardTileViewMode.BAR_GROUPED },
  { label: 'Bar (stacked)', value: DashboardTileViewMode.BAR_STACKED },
  { label: 'Table', value: DashboardTileViewMode.TABLE },
  { label: 'Sankey', value: DashboardTileViewMode.SANKEY },
] as const

export const USER_FLOW_TILE_VIEW_MODES = [{ label: 'Sankey', value: DashboardTileViewMode.SANKEY }] as const

export const getInitialDashboardTileViewMode = (mode: DashboardTileViewMode | undefined): DashboardTileViewMode => {
  switch (mode) {
    case DashboardTileViewMode.LINE:
    case DashboardTileViewMode.AREA:
    case DashboardTileViewMode.BAR_GROUPED:
    case DashboardTileViewMode.BAR_STACKED:
    case DashboardTileViewMode.TABLE:
      return mode
    case DashboardTileViewMode.SANKEY:
      return mode
    default:
      return DEFAULT_DASHBOARD_TILE_VIEW_MODE
  }
}

export const dashboardTileViewModeToViewMode = (mode: DashboardTileViewMode | undefined): ViewMode => {
  switch (getInitialDashboardTileViewMode(mode)) {
    case DashboardTileViewMode.AREA:
      return 'area'
    case DashboardTileViewMode.BAR_GROUPED:
      return 'bar-grouped'
    case DashboardTileViewMode.BAR_STACKED:
      return 'bar-stacked'
    case DashboardTileViewMode.TABLE:
      return 'table'
    case DashboardTileViewMode.SANKEY:
      return 'sankey'
    case DashboardTileViewMode.LINE:
    default:
      return 'line'
  }
}
