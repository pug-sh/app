import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DashboardTileSchema,
  DashboardTileViewMode,
  InsightTileContentSchema,
  VisualizationOptions_LegendPosition,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightQuerySpecSchema, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { DisplayTab } from './display-tab'

vi.mock('@/components/event-filters', () => ({ PropertyPickerList: () => null }))

const trendTile = (viewMode = DashboardTileViewMode.PIE) =>
  create(DashboardTileSchema, {
    viewMode,
    content: {
      case: 'insight',
      value: create(InsightTileContentSchema, {
        spec: create(InsightQuerySpecSchema, { insightType: InsightType.TRENDS }),
      }),
    },
  })

describe('DisplayTab legend options', () => {
  it('shows the legend by default and stores the inverse hide flag', () => {
    const onPatch = vi.fn()
    render(<DisplayTab tile={trendTile()} onPatch={onPatch} />)

    const showLegend = screen.getByRole('checkbox', { name: 'Show legend' })
    expect(showLegend.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(showLegend)

    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ visualization: expect.objectContaining({ hideLegend: true }) }),
    )
  })

  it('offers bottom and right placement on other chart modes', () => {
    const onPatch = vi.fn()
    render(<DisplayTab tile={trendTile(DashboardTileViewMode.LINE)} onPatch={onPatch} />)

    fireEvent.click(screen.getByRole('button', { name: /position.*bottom/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))

    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        visualization: expect.objectContaining({
          legendPosition: VisualizationOptions_LegendPosition.RIGHT,
        }),
      }),
    )
  })

  it('shows pie labels by default and stores the inverse hide flag', () => {
    const onPatch = vi.fn()
    render(<DisplayTab tile={trendTile()} onPatch={onPatch} />)

    const showLabels = screen.getByRole('checkbox', { name: 'Show labels' })
    expect(showLabels.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(showLabels)

    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ visualization: expect.objectContaining({ hidePieLabels: true }) }),
    )
  })

  it('does not offer pie labels on other chart modes', () => {
    render(<DisplayTab tile={trendTile(DashboardTileViewMode.LINE)} onPatch={vi.fn()} />)

    expect(screen.queryByRole('checkbox', { name: 'Show labels' })).toBeNull()
  })
})
