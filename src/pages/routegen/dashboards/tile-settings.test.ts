import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import {
  DashboardTileSchema,
  DashboardTileViewMode,
  InsightTileContentSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightQuerySpecSchema, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { tileOptionApplicability } from './panels/option-applicability'
import {
  DASHBOARD_TILE_VIEW_MODES,
  dashboardTileViewModeToViewMode,
  getInitialDashboardTileViewMode,
} from './tile-settings'

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
