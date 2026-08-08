import { describe, expect, it } from 'vitest'
import type { SankeyChartData } from '../user-flow'
import { layoutSankey, sankeyExtent } from './sankey-layout'

const OPTIONS = {
  width: 800,
  height: 400,
  nodeWidth: 12,
  nodePadding: 18,
  paddingLeft: 100,
  paddingRight: 100,
  paddingTop: 16,
  paddingBottom: 16,
}

// A → {B, C} at step 1, and only B continues to D at step 2. C is a terminal node: those
// sessions ended after one hop. This is the shape that separates depth-from-the-server
// from depth-inferred-from-the-graph.
const FLOW: SankeyChartData = {
  nodes: [
    { id: 'a0', name: 'page_view', stepDepth: 0, isOthers: false },
    { id: 'b1', name: 'signup', stepDepth: 1, isOthers: false },
    { id: 'c1', name: 'bounce', stepDepth: 1, isOthers: false },
    { id: 'd2', name: 'purchase', stepDepth: 2, isOthers: false },
  ],
  links: [
    { source: 0, target: 1, value: 60, sourceName: 'page_view', targetName: 'signup' },
    { source: 0, target: 2, value: 40, sourceName: 'page_view', targetName: 'bounce' },
    { source: 1, target: 3, value: 30, sourceName: 'signup', targetName: 'purchase' },
  ],
}

const byName = (layout: ReturnType<typeof layoutSankey>, name: string) => {
  const node = layout.nodes.find(n => n.name === name)
  if (!node) throw new Error(`no node ${name}`)
  return node
}

describe('layoutSankey columns', () => {
  // The reason this layout exists. A graph-walking Sankey assigns depth by longest path
  // and pulls terminal nodes to the final column, so "bounce" would be drawn beside
  // "purchase" as if those sessions had continued a step further than they did.
  it('pins a terminal node to its own step, not the last column', () => {
    const layout = layoutSankey(FLOW, OPTIONS)

    expect(byName(layout, 'bounce').x).toBe(byName(layout, 'signup').x)
    expect(byName(layout, 'bounce').x).toBeLessThan(byName(layout, 'purchase').x)
  })

  it('spreads columns evenly across the plot area', () => {
    const layout = layoutSankey(FLOW, OPTIONS)

    expect(byName(layout, 'page_view').x).toBe(OPTIONS.paddingLeft)
    expect(byName(layout, 'purchase').x + OPTIONS.nodeWidth).toBe(OPTIONS.width - OPTIONS.paddingRight)
  })

  // Every other fixture starts at stepDepth 0, which is exactly the case where normalising
  // against the smallest depth and normalising against zero agree — so they cannot tell the two
  // apart. sankeyExtent already measures the span, and the two disagreeing is what would leave a
  // third of the canvas blank.
  it('anchors the first column at the left edge even when the depths start late', () => {
    const offset: SankeyChartData = {
      nodes: [
        { id: 'a2', name: 'page_view', stepDepth: 2, isOthers: false },
        { id: 'b3', name: 'signup', stepDepth: 3, isOthers: false },
      ],
      links: [{ source: 0, target: 1, value: 10, sourceName: 'page_view', targetName: 'signup' }],
    }
    const layout = layoutSankey(offset, OPTIONS)

    expect(byName(layout, 'page_view').x).toBe(OPTIONS.paddingLeft)
    expect(byName(layout, 'signup').x + OPTIONS.nodeWidth).toBe(OPTIONS.width - OPTIONS.paddingRight)
  })
})

describe('layoutSankey vertical scale', () => {
  // One scale across every column. Per-column normalisation would refill the height at
  // each step, drawing 30 surviving sessions as tall as the 100 that started.
  it('shrinks a lighter column in proportion to the flow it carries', () => {
    const layout = layoutSankey(FLOW, OPTIONS)

    const stepOne = byName(layout, 'signup').height + byName(layout, 'bounce').height
    const stepTwo = byName(layout, 'purchase').height

    expect(stepTwo / stepOne).toBeCloseTo(0.3, 2)
  })

  it('sizes a node by its inbound flow, not by what continues past it', () => {
    const layout = layoutSankey(FLOW, OPTIONS)

    // 60 sessions reach signup and only 30 continue; the node stays as tall as the 60.
    expect(byName(layout, 'signup').height).toBeCloseTo(byName(layout, 'purchase').height * 2, 1)
  })
})

describe('sankeyExtent', () => {
  // The chart reserves padding for widestColumn - 1 gaps when deciding whether it has to grow
  // its canvas and scroll. Taking the node total instead of the busiest column would overstate
  // every multi-column flow and scroll charts that fit fine.
  it('measures the busiest column, not the whole graph', () => {
    // 1 node at step 0, 2 at step 1, 1 at step 2 — four nodes, three columns.
    expect(sankeyExtent(FLOW)).toEqual({ widestColumn: 2, stepCount: 3 })
  })

  it('counts steps spanned, so a gap in the depths still reserves its column', () => {
    const sparse: SankeyChartData = {
      nodes: [
        { id: 'a', name: 'a', stepDepth: 0, isOthers: false },
        { id: 'b', name: 'b', stepDepth: 3, isOthers: false },
      ],
      links: [{ source: 0, target: 1, value: 1, sourceName: 'a', targetName: 'b' }],
    }

    expect(sankeyExtent(sparse)).toEqual({ widestColumn: 1, stepCount: 4 })
  })

  it('reports nothing for an empty graph', () => {
    expect(sankeyExtent({ nodes: [], links: [] })).toEqual({ widestColumn: 0, stepCount: 0 })
  })
})

describe('layoutSankey flow accounting', () => {
  // The hover card reads these to say "N continued, M ended", and picks a different
  // sentence for the two ends of the flow — so zero has to mean "no such side", not "no
  // data". Collapsing them into one value would make an entry node look like a dead end.
  it('reports an entry node as outbound-only', () => {
    const entry = byName(layoutSankey(FLOW, OPTIONS), 'page_view')

    expect(entry.inflow).toBe(0)
    expect(entry.outflow).toBe(100)
    expect(entry.value).toBe(100)
  })

  it('reports a terminal node as inbound-only', () => {
    const terminal = byName(layoutSankey(FLOW, OPTIONS), 'bounce')

    expect(terminal.inflow).toBe(40)
    expect(terminal.outflow).toBe(0)
  })

  it('keeps both sides on a node that sheds sessions', () => {
    const middle = byName(layoutSankey(FLOW, OPTIONS), 'signup')

    // 60 arrived, 30 continued, so 30 ended here.
    expect(middle.inflow).toBe(60)
    expect(middle.outflow).toBe(30)
    expect(middle.inflow - middle.outflow).toBe(30)
  })
})

// One dominant path plus a long tail of near-zero ones. The tail links each round up to
// MIN_LINK_THICKNESS while the tail *nodes* round up to MIN_NODE_HEIGHT independently, so a
// band sized only by its weight is far too short to anchor the ribbons attached to it.
const skewed: SankeyChartData = {
  nodes: [
    { id: 'a0', name: 'page_view', stepDepth: 0, isOthers: false },
    { id: 'big', name: 'checkout', stepDepth: 1, isOthers: false },
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      name: `tail_${i}`,
      stepDepth: 1,
      isOthers: false,
    })),
  ],
  links: [
    { source: 0, target: 1, value: 100_000, sourceName: 'page_view', targetName: 'checkout' },
    ...Array.from({ length: 20 }, (_, i) => ({
      source: 0,
      target: i + 2,
      value: 1,
      sourceName: 'page_view',
      targetName: `tail_${i}`,
    })),
  ],
}

// The mirror image of `skewed`: a long tail of near-zero sources converging on one node. The
// outbound floor cannot see this shape at all — every tail node has a single ribbon, which any
// 2px band holds — so only the *inbound* stack floor keeps the sink's band tall enough.
const converging: SankeyChartData = {
  nodes: [
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      name: `source_${i}`,
      stepDepth: 0,
      isOthers: false,
    })),
    { id: 'big', name: 'bulk', stepDepth: 0, isOthers: false },
    { id: 'sink', name: 'checkout', stepDepth: 1, isOthers: false },
  ],
  links: [
    ...Array.from({ length: 20 }, (_, i) => ({
      source: i,
      target: 21,
      value: 1,
      sourceName: `source_${i}`,
      targetName: 'checkout',
    })),
    { source: 20, target: 21, value: 100_000, sourceName: 'bulk', targetName: 'checkout' },
  ],
}

describe('layoutSankey skewed flow', () => {
  it('grows a band to hold the ribbons it anchors', () => {
    const layout = layoutSankey(skewed, OPTIONS)

    for (const node of layout.nodes) {
      const outbound = layout.links.filter(l => l.source === layout.nodes.indexOf(node))
      const stacked = outbound.reduce((sum, l) => sum + l.thickness, 0)
      expect(node.height).toBeGreaterThanOrEqual(stacked - 0.001)
    }
  })

  it('keeps every ribbon inside its source band even when the flow is lopsided', () => {
    const layout = layoutSankey(skewed, OPTIONS)
    const source = byName(layout, 'page_view')

    for (const link of layout.links) {
      expect(link.sourceY - link.thickness / 2).toBeGreaterThanOrEqual(source.y - 0.001)
      expect(link.sourceY + link.thickness / 2).toBeLessThanOrEqual(source.y + source.height + 0.001)
    }
  })

  it('keeps every ribbon inside its target band', () => {
    const layout = layoutSankey(skewed, OPTIONS)

    for (const link of layout.links) {
      const target = layout.nodes[link.target]
      expect(link.targetY - link.thickness / 2).toBeGreaterThanOrEqual(target.y - 0.001)
      expect(link.targetY + link.thickness / 2).toBeLessThanOrEqual(target.y + target.height + 0.001)
    }
  })
})

describe('layoutSankey converging flow', () => {
  // `skewed` is pure fan-out, so it cannot see the inbound half of the band floor: every tail
  // node there has one inbound ribbon, which the 2px minimum already holds. Deleting
  // stackHeight(incoming) from nodeHeights left that whole suite green. This is the shape that
  // catches it — twenty 1px ribbons converging on a band worth a fraction of a pixel.
  it('grows a band to hold the ribbons arriving at it', () => {
    const layout = layoutSankey(converging, OPTIONS)
    const sink = byName(layout, 'checkout')
    const stacked = layout.links.reduce((sum, link) => sum + link.thickness, 0)

    expect(sink.height).toBeGreaterThanOrEqual(stacked - 0.001)
  })

  it('keeps every ribbon inside the band it arrives at', () => {
    const layout = layoutSankey(converging, OPTIONS)
    const sink = byName(layout, 'checkout')

    for (const link of layout.links) {
      expect(link.targetY - link.thickness / 2).toBeGreaterThanOrEqual(sink.y - 0.001)
      expect(link.targetY + link.thickness / 2).toBeLessThanOrEqual(sink.y + sink.height + 0.001)
    }
  })
})

describe('layoutSankey canvas fit', () => {
  // The band floors round *up*, and they are applied after `scale` has already been derived from
  // the height the caller measured — so a lopsided column can end up taller than the box it was
  // measured for. The chart draws into an SVG of exactly that height and the container's
  // scrollHeight matches it, so anything past the bottom edge is clipped with no way to scroll to
  // it. The layout has to report the height it actually used.
  it('reports a canvas tall enough to hold every band it laid out', () => {
    const layout = layoutSankey(skewed, OPTIONS)
    const lowestBand = Math.max(...layout.nodes.map(node => node.y + node.height))

    expect(layout.contentHeight).toBeGreaterThanOrEqual(lowestBand + OPTIONS.paddingBottom)
  })

  it('leaves the canvas alone when the flow already fits', () => {
    expect(layoutSankey(FLOW, OPTIONS).contentHeight).toBe(OPTIONS.height)
  })

  // Growing for the busiest column must not strand the lighter ones at the old centre.
  it('centres every column in the grown canvas, not the measured one', () => {
    const layout = layoutSankey(skewed, OPTIONS)
    const source = byName(layout, 'page_view')
    const plotMiddle = (layout.contentHeight - OPTIONS.paddingTop - OPTIONS.paddingBottom) / 2

    expect(source.y + source.height / 2).toBeCloseTo(OPTIONS.paddingTop + plotMiddle, 1)
  })
})

describe('layoutSankey ribbons', () => {
  it('keeps every ribbon inside the band of the node it leaves', () => {
    const layout = layoutSankey(FLOW, OPTIONS)
    const source = byName(layout, 'page_view')

    for (const link of layout.links.filter(l => l.sourceName === 'page_view')) {
      expect(link.sourceY - link.thickness / 2).toBeGreaterThanOrEqual(source.y - 0.001)
      expect(link.sourceY + link.thickness / 2).toBeLessThanOrEqual(source.y + source.height + 0.001)
    }
  })

  it('starts ribbons at the source edge and ends them at the target edge', () => {
    const layout = layoutSankey(FLOW, OPTIONS)
    const link = layout.links.find(l => l.targetName === 'purchase')

    expect(link?.sourceX).toBe(byName(layout, 'signup').x + OPTIONS.nodeWidth)
    expect(link?.targetX).toBe(byName(layout, 'purchase').x)
  })
})

describe('layoutSankey degenerate input', () => {
  // Not reachable from SankeyChart today — its canvas floors at MIN_FLOW_HEIGHT and the
  // gutters, so layoutSankey never sees 0x0. These pin the pure function's own contract, so a
  // future caller that does hand it an unmeasured box gets an empty layout rather than NaN
  // geometry that renders as invisible garbage.
  // contentHeight is 0 rather than options.height so a caller that maxes its own estimate against
  // it can't be talked into growing a canvas for a layout that drew nothing.
  it('returns nothing when the container has no size yet', () => {
    expect(layoutSankey(FLOW, { ...OPTIONS, width: 0, height: 0 })).toEqual({
      nodes: [],
      links: [],
      contentHeight: 0,
    })
  })

  it('returns nothing when the gutters exceed the width', () => {
    expect(layoutSankey(FLOW, { ...OPTIONS, width: 120 })).toEqual({ nodes: [], links: [], contentHeight: 0 })
  })

  it('returns nothing when there are no links to draw', () => {
    expect(layoutSankey({ nodes: FLOW.nodes, links: [] }, OPTIONS)).toEqual({
      nodes: [],
      links: [],
      contentHeight: 0,
    })
  })
})

describe('layoutSankey node order', () => {
  it('stacks the heaviest node first and pins the overflow bucket last', () => {
    const withOthers: SankeyChartData = {
      nodes: [
        { id: 'a0', name: 'page_view', stepDepth: 0, isOthers: false },
        { id: 'o1', name: 'Others', stepDepth: 1, isOthers: true },
        { id: 'b1', name: 'signup', stepDepth: 1, isOthers: false },
        { id: 'c1', name: 'bounce', stepDepth: 1, isOthers: false },
      ],
      links: [
        { source: 0, target: 1, value: 90, sourceName: 'page_view', targetName: 'Others' },
        { source: 0, target: 2, value: 20, sourceName: 'page_view', targetName: 'signup' },
        { source: 0, target: 3, value: 50, sourceName: 'page_view', targetName: 'bounce' },
      ],
    }
    const layout = layoutSankey(withOthers, OPTIONS)

    // bounce (50) above signup (20), and Others last despite carrying the most.
    expect(byName(layout, 'bounce').y).toBeLessThan(byName(layout, 'signup').y)
    expect(byName(layout, 'Others').y).toBeGreaterThan(byName(layout, 'signup').y)
  })
})
