import { describe, expect, it } from 'vitest'
import type { SankeyChartData } from '../user-flow'
import { layoutSankey } from './sankey-layout'

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
  // The chart mounts before the ResizeObserver reports, so a zero-sized pass happens on
  // every render and must not produce NaN geometry.
  it('returns nothing when the container has no size yet', () => {
    expect(layoutSankey(FLOW, { ...OPTIONS, width: 0, height: 0 })).toEqual({ nodes: [], links: [] })
  })

  it('returns nothing when the gutters exceed the width', () => {
    expect(layoutSankey(FLOW, { ...OPTIONS, width: 120 })).toEqual({ nodes: [], links: [] })
  })

  it('returns nothing when there are no links to draw', () => {
    expect(layoutSankey({ nodes: FLOW.nodes, links: [] }, OPTIONS)).toEqual({ nodes: [], links: [] })
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
