import {
  DashboardTileViewMode,
  VisualizationOptions_LegendPosition,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { ViewMode } from '../insights/constants'

export const DEFAULT_DASHBOARD_TILE_VIEW_MODE = DashboardTileViewMode.LINE

export const resolveDashboardLegendPosition = (position: VisualizationOptions_LegendPosition | undefined) => {
  if (position === VisualizationOptions_LegendPosition.RIGHT) {
    return VisualizationOptions_LegendPosition.RIGHT
  }
  return VisualizationOptions_LegendPosition.BOTTOM
}

export const DASHBOARD_TILE_VIEW_MODES = [
  { label: 'KPI', value: DashboardTileViewMode.KPI },
  { label: 'Line', value: DashboardTileViewMode.LINE },
  { label: 'Area', value: DashboardTileViewMode.AREA },
  { label: 'Bar (grouped)', value: DashboardTileViewMode.BAR_GROUPED },
  { label: 'Bar (stacked)', value: DashboardTileViewMode.BAR_STACKED },
  { label: 'Pie', value: DashboardTileViewMode.PIE },
  { label: 'Table', value: DashboardTileViewMode.TABLE },
] as const

export const getInitialDashboardTileViewMode = (mode: DashboardTileViewMode | undefined): DashboardTileViewMode => {
  switch (mode) {
    case DashboardTileViewMode.LINE:
    case DashboardTileViewMode.AREA:
    case DashboardTileViewMode.BAR_GROUPED:
    case DashboardTileViewMode.BAR_STACKED:
    case DashboardTileViewMode.PIE:
    case DashboardTileViewMode.TABLE:
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
    case DashboardTileViewMode.PIE:
      return 'pie'
    case DashboardTileViewMode.TABLE:
      return 'table'
    case DashboardTileViewMode.LINE:
    default:
      return 'line'
  }
}
