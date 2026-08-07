// Placement for the live map's single popover. The map owns one popover that follows whichever
// marker is hovered or pinned, so the side it opens on has to be solved per anchor: a face near the
// top of the canvas can't open upward, and one behind the live panel has to step out from under it.

export type Side = 'top' | 'bottom' | 'left' | 'right'

export type Rect = { x: number; y: number; width: number; height: number }

export type Placement = {
  side: Side
  x: number
  y: number
  // Arrow centre along the popover's anchored edge — from its left for top/bottom, from its top for
  // left/right. Null when the anchor sits too near a corner to draw the arrow without overrunning it.
  arrow: number | null
}

type Input = {
  anchor: { x: number; y: number }
  anchorRadius: number
  popover: { width: number; height: number }
  container: { width: number; height: number }
  obstacles?: Rect[]
}

const ORDER: Side[] = ['top', 'bottom', 'right', 'left']
// Clearance between the marker and the popover, and between the popover and the canvas edge.
const GAP = 10
const MARGIN = 8
// POPOVER_SURFACE's rounded-xl radius (16) plus the arrow's half-diagonal (~7), so a shifted box
// never parks the arrow on a corner where it would show its own outline.
const ARROW_INSET = 24
// How far past that inset the anchor may sit before the arrow is dropped rather than clamped.
const ARROW_SLACK = 12
// Cost of going arrowless, in the same square-pixel currency as overlap: the solver will clip up to a
// 20×20 corner of the panel rather than drop the arrow.
const ARROWLESS_PENALTY = 400

const clamp = (value: number, min: number, max: number) => {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

const overlapArea = (a: Rect, b: Rect) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  return w * h
}

const outsideArea = (rect: Rect, container: { width: number; height: number }) => {
  const inside = overlapArea(rect, { x: 0, y: 0, width: container.width, height: container.height })
  return rect.width * rect.height - inside
}

// Candidate positions along the popover's free axis: centred on the anchor first, then flush to
// either side of each obstacle. Escaping the live panel is a slide along the edge, not another side.
const freeAxisCandidates = (centred: number, size: number, obstacles: Rect[], vertical: boolean) => {
  const candidates = [centred]
  for (const o of obstacles) {
    const near = vertical ? o.y : o.x
    const far = vertical ? o.y + o.height : o.x + o.width
    candidates.push(near - size, far)
  }
  return candidates
}

const rectFor = (
  side: Side,
  anchor: { x: number; y: number },
  offset: number,
  popover: { width: number; height: number },
) => {
  if (side === 'top') return { x: anchor.x - popover.width / 2, y: anchor.y - offset - popover.height }
  if (side === 'bottom') return { x: anchor.x - popover.width / 2, y: anchor.y + offset }
  if (side === 'left') return { x: anchor.x - offset - popover.width, y: anchor.y - popover.height / 2 }
  return { x: anchor.x + offset, y: anchor.y - popover.height / 2 }
}

export const resolvePlacement = ({ anchor, anchorRadius, popover, container, obstacles = [] }: Input): Placement => {
  let best: Placement | null = null
  let bestPenalty = Number.POSITIVE_INFINITY

  for (const side of ORDER) {
    const vertical = side === 'left' || side === 'right'
    const base = rectFor(side, anchor, anchorRadius + GAP, popover)
    // The anchored axis is fixed by the side; only the free axis can slide.
    const fixed = vertical ? base.x : base.y
    const centred = vertical ? base.y : base.x
    const size = vertical ? popover.height : popover.width
    const span = vertical ? container.height : container.width

    for (const raw of freeAxisCandidates(centred, size, obstacles, vertical)) {
      const free = clamp(raw, MARGIN, span - size - MARGIN)
      const rect = {
        x: vertical ? fixed : free,
        y: vertical ? free : fixed,
        width: popover.width,
        height: popover.height,
      }

      const along = vertical ? anchor.y - rect.y : anchor.x - rect.x
      const pointable = along >= ARROW_INSET - ARROW_SLACK && along <= size - ARROW_INSET + ARROW_SLACK

      let penalty = outsideArea(rect, container)
      for (const o of obstacles) penalty += overlapArea(rect, o)
      if (!pointable) penalty += ARROWLESS_PENALTY
      // Break ties toward the least displacement so an unobstructed popover stays centred.
      penalty += Math.abs(free - centred) * 0.001

      if (penalty >= bestPenalty) continue

      bestPenalty = penalty
      best = {
        side,
        x: rect.x,
        y: rect.y,
        arrow: pointable ? clamp(along, ARROW_INSET, size - ARROW_INSET) : null,
      }
    }

    // A side that clears the canvas and every obstacle is the preferred one; stop looking.
    if (bestPenalty < 1) break
  }

  // Unreachable with a non-empty ORDER, but keeps the return type honest.
  return best ?? { side: 'top', x: anchor.x, y: anchor.y, arrow: null }
}
