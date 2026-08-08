import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import {
  DashboardTileSchema,
  DashboardTileViewMode,
  InsightTileContentSchema,
  VisualizationOptions_LegendPosition,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightQuerySpecSchema, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { tileOptionApplicability } from './panels/option-applicability'
import {
  DASHBOARD_TILE_VIEW_MODES,
  dashboardTileViewModeToViewMode,
  getInitialDashboardTileViewMode,
  resolveDashboardLegendPosition,
} from './tile-settings'

describe('dashboard legend position', () => {
  it('falls back to top and preserves every explicit position', () => {
    expect(resolveDashboardLegendPosition(undefined)).toBe(VisualizationOptions_LegendPosition.TOP)
    expect(resolveDashboardLegendPosition(VisualizationOptions_LegendPosition.UNSPECIFIED)).toBe(
      VisualizationOptions_LegendPosition.TOP,
    )
    expect(resolveDashboardLegendPosition(VisualizationOptions_LegendPosition.TOP)).toBe(
      VisualizationOptions_LegendPosition.TOP,
    )
    expect(resolveDashboardLegendPosition(VisualizationOptions_LegendPosition.BOTTOM)).toBe(
      VisualizationOptions_LegendPosition.BOTTOM,
    )
    expect(resolveDashboardLegendPosition(VisualizationOptions_LegendPosition.RIGHT)).toBe(
      VisualizationOptions_LegendPosition.RIGHT,
    )
  })
})

// The display picker stops a *new* tile reaching this combination, but viewMode and insightType
// are independent fields on one persisted message, so a tile saved before the picker was split —
// or written straight to the API — still arrives here.
describe('dashboard sankey view mode', () => {
  it('is preserved on read but never selects a chart of its own', () => {
    expect(DASHBOARD_TILE_VIEW_MODES).not.toContainEqual({ label: 'Sankey', value: DashboardTileViewMode.SANKEY })
    expect(getInitialDashboardTileViewMode(DashboardTileViewMode.SANKEY)).toBe(DashboardTileViewMode.SANKEY)
    // Degrades to a line chart rather than falling through the chart switch into grouped bars,
    // which is what a trends tile left on SANKEY used to draw under a chip reading "Sankey".
    expect(dashboardTileViewModeToViewMode(DashboardTileViewMode.SANKEY)).toBe('line')
  })
})

describe('dashboard pie view mode', () => {
  it('is selectable, preserved, and mapped to the pie renderer', () => {
    expect(DASHBOARD_TILE_VIEW_MODES).toContainEqual({ label: 'Pie', value: DashboardTileViewMode.PIE })
    expect(getInitialDashboardTileViewMode(DashboardTileViewMode.PIE)).toBe(DashboardTileViewMode.PIE)
    expect(dashboardTileViewModeToViewMode(DashboardTileViewMode.PIE)).toBe('pie')
  })

  it('offers legend controls without cartesian axis controls', () => {
    const tile = create(DashboardTileSchema, {
      viewMode: DashboardTileViewMode.PIE,
      content: {
        case: 'insight',
        value: create(InsightTileContentSchema, {
          spec: create(InsightQuerySpecSchema, { insightType: InsightType.TRENDS }),
        }),
      },
    })

    expect(tileOptionApplicability(tile)).toEqual({
      showViewMode: true,
      showKpiOptions: false,
      showAxisOptions: false,
      showLegendOption: true,
      showPieLabelOption: true,
    })
  })
})
