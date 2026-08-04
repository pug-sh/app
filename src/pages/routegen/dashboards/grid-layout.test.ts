import { describe, expect, it } from 'vitest'
import { DashboardGridMode as DashboardGridModeProto } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  DISPLAY_GRID_COLUMNS,
  dashboardGridModeFromProto,
  dashboardGridModeToProto,
  displayPositionToStored,
  gridPositionForStorage,
  storedPositionForGrid,
  storedPositionToDisplay,
} from './grid-layout'

describe('dashboard grid coordinates', () => {
  it('maps persisted grid modes and treats unspecified values as free', () => {
    expect(dashboardGridModeFromProto(DashboardGridModeProto.UNSPECIFIED)).toBe('free')
    expect(dashboardGridModeFromProto(DashboardGridModeProto.FREE)).toBe('free')
    expect(dashboardGridModeFromProto(DashboardGridModeProto.COLUMNS_12)).toBe('columns-12')
    expect(dashboardGridModeToProto('free')).toBe(DashboardGridModeProto.FREE)
    expect(dashboardGridModeToProto('columns-12')).toBe(DashboardGridModeProto.COLUMNS_12)
  })

  it('maps canonical dashboard widths onto a 12-column grid', () => {
    expect(storedPositionToDisplay({ x: 0, y: 3, w: 36, h: 18 })).toEqual({ x: 0, y: 3, w: 6, h: 18 })
    expect(storedPositionToDisplay({ x: 36, y: 3, w: 36, h: 18 })).toEqual({ x: 6, y: 3, w: 6, h: 18 })
  })

  it('rounds legacy fine-grid positions and keeps them within the display grid', () => {
    const result = storedPositionToDisplay({ x: 68, y: 4, w: 12, h: 9 })
    expect(result).toEqual({ x: 11, y: 4, w: 1, h: 9 })
    expect(result.x + result.w).toBeLessThanOrEqual(DISPLAY_GRID_COLUMNS)
  })

  it('writes edited positions back in the existing 72-unit storage format', () => {
    expect(displayPositionToStored({ x: 3, y: 7, w: 4, h: 15 })).toEqual({ x: 18, y: 7, w: 24, h: 15 })
  })

  it('leaves positions untouched in free mode', () => {
    const position = { x: 17, y: 7, w: 29, h: 15 }

    expect(storedPositionForGrid(position, 'free')).toEqual(position)
    expect(gridPositionForStorage(position, 'free')).toEqual(position)
  })

  it('only translates positions at the 12-column grid boundary', () => {
    const stored = { x: 18, y: 7, w: 24, h: 15 }
    const displayed = { x: 3, y: 7, w: 4, h: 15 }

    expect(storedPositionForGrid(stored, 'columns-12')).toEqual(displayed)
    expect(gridPositionForStorage(displayed, 'columns-12')).toEqual(stored)
  })
})
