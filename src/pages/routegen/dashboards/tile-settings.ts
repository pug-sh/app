import {
  DashboardTileViewMode,
  VisualizationOptions_LegendPosition,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { ViewMode } from '../insights/constants'

export const DEFAULT_DASHBOARD_TILE_VIEW_MODE = DashboardTileViewMode.LINE

export const resolveDashboardLegendPosition = (position: VisualizationOptions_LegendPosition | undefined) => {
  if (position === VisualizationOptions_LegendPosition.BOTTOM) {
    return VisualizationOptions_LegendPosition.BOTTOM
  }
  if (position === VisualizationOptions_LegendPosition.RIGHT) {
    return VisualizationOptions_LegendPosition.RIGHT
  }
  return VisualizationOptions_LegendPosition.TOP
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

// Sankey is deliberately absent from the list above: it is the only view a user-flow tile can
// take, and no other insight type can render it. Offering it beside the trends views let a
// trends tile be set to Sankey, which silently drew a bar chart.
export const USER_FLOW_TILE_VIEW_MODES = [{ label: 'Sankey', value: DashboardTileViewMode.SANKEY }] as const

export const getInitialDashboardTileViewMode = (mode: DashboardTileViewMode | undefined): DashboardTileViewMode => {
  switch (mode) {
    case DashboardTileViewMode.LINE:
    case DashboardTileViewMode.AREA:
    case DashboardTileViewMode.BAR_GROUPED:
    case DashboardTileViewMode.BAR_STACKED:
    case DashboardTileViewMode.PIE:
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
    case DashboardTileViewMode.PIE:
      return 'pie'
    case DashboardTileViewMode.TABLE:
      return 'table'
    // SANKEY has no ViewMode of its own — the Sankey renders off `resultCase === 'userFlow'`,
    // never off viewMode, so this value is never read for a user-flow tile. It maps to the
    // default so a tile left on SANKEY after switching away from user flow degrades to a line
    // chart rather than falling through the chart switch into bars.
    case DashboardTileViewMode.SANKEY:
    case DashboardTileViewMode.LINE:
    default:
      return 'line'
  }
}
