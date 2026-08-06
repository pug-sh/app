import { describe, expect, it } from 'vitest'
import { DISPLAY_GRID_COLUMNS, displayPositionToStored, storedPositionToDisplay } from './grid-layout'

describe('dashboard grid coordinates', () => {
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
})
