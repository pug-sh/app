import { type DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'

const CHART_VIEW_MODES = new Set([
  DashboardTileViewMode.LINE,
  DashboardTileViewMode.AREA,
  DashboardTileViewMode.BAR_GROUPED,
  DashboardTileViewMode.BAR_STACKED,
])

// Which display/format options actually affect a tile depends on its insight type
// and view mode — see the render branches in insight-tile-view.tsx and
// insights/content.tsx. Trends drives every chart/KPI option; funnel and retention
// have fixed renderers that ignore them, and markdown is not an insight at all. The
// panel uses these flags so it only surfaces options that do something.
export const tileOptionApplicability = (tile: DashboardTile) => {
  const insightType = tile.content.case === 'insight' ? tile.content.value.spec?.insightType : undefined
  const isTrends =
    tile.content.case === 'insight' &&
    (insightType === undefined || insightType === InsightType.UNSPECIFIED || insightType === InsightType.TRENDS)
  const isUserFlow = tile.content.case === 'insight' && insightType === InsightType.USER_FLOW
  const isMap = tile.content.case === 'insight' && insightType === InsightType.MAP
  const viewMode = tile.viewMode

  const isKpi = isTrends && viewMode === DashboardTileViewMode.KPI
  const isChart = isTrends && CHART_VIEW_MODES.has(viewMode)
  const isPie = isTrends && viewMode === DashboardTileViewMode.PIE
  const isTable = isTrends && viewMode === DashboardTileViewMode.TABLE

  return {
    // The view-mode picker changes the chart type for trends; user-flow and map tiles pick between
    // that type's own layouts (currently one each — Sankey, Map).
    showViewMode: isTrends || isUserFlow || isMap,
    // KPI big-number tiles: thresholds, value format, sparkline.
    showKpiOptions: isKpi,
    // Cartesian charts have a Y-axis to format.
    showAxisOptions: isChart,
    // The shared series legend renders for every non-KPI trends visualization.
    showLegendOption: isChart || isPie || isTable,
    // Slice labels are drawn only by the pie renderer.
    showPieLabelOption: isPie,
  }
}
