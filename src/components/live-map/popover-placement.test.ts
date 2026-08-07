import { describe, expect, it } from 'vitest'
import { resolvePlacement } from './popover-placement'

// A world map canvas with a 304×300 popover — the real proportions the live page runs at.
const base = {
  anchorRadius: 16,
  popover: { width: 304, height: 300 },
  container: { width: 1200, height: 800 },
}

// The live panel, as the map hands it over: bottom-left, floating above the canvas.
const PANEL = { x: 16, y: 480, width: 416, height: 304 }

const rectOf = (p: { x: number; y: number }) => ({ ...p, width: base.popover.width, height: base.popover.height })

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof PANEL) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

describe('resolvePlacement', () => {
  it('opens above and centred when there is room', () => {
    const p = resolvePlacement({ ...base, anchor: { x: 600, y: 500 } })
    expect(p.side).toBe('top')
    expect(p.x).toBe(600 - 152)
    expect(p.y).toBe(500 - 16 - 10 - 300)
    // Arrow sits under the anchor, i.e. the box's midpoint.
    expect(p.arrow).toBe(152)
  })

  it('flips below a marker too close to the top edge', () => {
    const p = resolvePlacement({ ...base, anchor: { x: 600, y: 40 } })
    expect(p.side).toBe('bottom')
    expect(p.y).toBe(40 + 16 + 10)
  })

  it('slides in from the left edge and walks the arrow back toward the anchor', () => {
    const p = resolvePlacement({ ...base, anchor: { x: 30, y: 500 } })
    expect(p.x).toBe(8)
    // Box shifted right of centre, so the arrow moves left — as far as the corner inset allows.
    expect(p.arrow).toBe(24)
    expect(p.arrow).toBeLessThan(152)
  })

  it('stays on canvas, clears the panel, and keeps a drawn arrow off the rounded corners', () => {
    let drawn = 0
    let dropped = 0
    for (let x = 0; x <= 1200; x += 60) {
      for (let y = 0; y <= 800; y += 50) {
        const p = resolvePlacement({ ...base, anchor: { x, y }, obstacles: [PANEL] })
        expect(p.x).toBeGreaterThanOrEqual(8)
        expect(p.y).toBeGreaterThanOrEqual(8)
        expect(p.x + base.popover.width).toBeLessThanOrEqual(1200 - 8)
        expect(p.y + base.popover.height).toBeLessThanOrEqual(800 - 8)
        expect(overlaps(rectOf(p), PANEL)).toBe(false)
        if (p.arrow === null) {
          dropped++
          continue
        }
        drawn++
        const edge = p.side === 'top' || p.side === 'bottom' ? base.popover.width : base.popover.height
        expect(p.arrow).toBeGreaterThanOrEqual(24)
        expect(p.arrow).toBeLessThanOrEqual(edge - 24)
      }
    }
    // Both branches have to be exercised, or the arrow assertions above pass vacuously.
    expect(drawn).toBeGreaterThan(0)
    expect(dropped).toBeGreaterThan(0)
  })

  it('turns to the side for a marker pinned against the left edge', () => {
    const p = resolvePlacement({ ...base, anchor: { x: 0, y: 500 } })
    expect(p.side).toBe('right')
    expect(p.arrow).toBe(150)
  })

  it('steps out from under a floating panel instead of opening into it', () => {
    // Just off the panel's right edge: opening upward and centred would drop the box's lower-left
    // corner onto the panel, so it slides right — and is still close enough to keep its arrow.
    const anchor = { x: 460, y: 600 }
    expect(overlaps(rectOf(resolvePlacement({ ...base, anchor })), PANEL)).toBe(true)

    const p = resolvePlacement({ ...base, anchor, obstacles: [PANEL] })
    expect(overlaps(rectOf(p), PANEL)).toBe(false)
    expect(p.arrow).not.toBeNull()
  })

  it('clears a panel that covers the marker itself', () => {
    const p = resolvePlacement({ ...base, anchor: { x: 200, y: 600 }, obstacles: [PANEL] })
    expect(overlaps(rectOf(p), PANEL)).toBe(false)
    expect(p.x).toBeGreaterThanOrEqual(8)
    expect(p.y).toBeGreaterThanOrEqual(8)
  })

  it('drops the arrow rather than pointing it at empty map', () => {
    // Wedged into the top-left corner by a panel that leaves no room to point back at the marker.
    const p = resolvePlacement({
      ...base,
      anchor: { x: 20, y: 780 },
      obstacles: [{ x: 0, y: 320, width: 700, height: 480 }],
    })
    expect(p.arrow).toBeNull()
  })

  it('stays on canvas in a viewport barely taller than the popover', () => {
    const p = resolvePlacement({ ...base, anchor: { x: 600, y: 150 }, container: { width: 1200, height: 320 } })
    expect(p.y).toBeGreaterThanOrEqual(8)
    expect(p.y + base.popover.height).toBeLessThanOrEqual(320 - 8 + 1)
  })

  it('never returns NaN when the popover cannot fit at all', () => {
    const p = resolvePlacement({ ...base, anchor: { x: 100, y: 100 }, container: { width: 200, height: 200 } })
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
    // null is a documented result — only a NaN arrow is a bug.
    expect(p.arrow === null || Number.isFinite(p.arrow)).toBe(true)
  })
})
