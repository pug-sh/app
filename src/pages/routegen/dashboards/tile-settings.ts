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
// trends tile be set to Sankey, which silently drew a bar chart. A one-option picker looks
// redundant, but it names the tile's view the same way every other tile's does, and it is where
// further flow layouts would land.
export const USER_FLOW_TILE_VIEW_MODES = [{ label: 'Sankey', value: DashboardTileViewMode.SANKEY }] as const

// Same reasoning as Sankey above: the only view a map tile can take, kept as a named picker rather
// than no picker at all. A second entry lands here if the ranked country table ever becomes a view.
export const MAP_TILE_VIEW_MODES = [{ label: 'Map', value: DashboardTileViewMode.MAP }] as const

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
    case DashboardTileViewMode.MAP:
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
    // SANKEY and MAP have no ViewMode of their own — a user-flow or map tile is dispatched on its
    // insight type (or result case) *before* the chart switch is reached, so the mapping never
    // selects the chart for one. It is still read: insight-tile-view computes effectiveViewMode for
    // every tile, and content.tsx uses it for sizing and legend placement above that dispatch.
    // Mapping to the default is what makes a tile left on one of these after switching insight type
    // degrade to a line chart rather than falling through the switch into bars.
    case DashboardTileViewMode.SANKEY:
    case DashboardTileViewMode.MAP:
    case DashboardTileViewMode.LINE:
    default:
      return 'line'
  }
}
