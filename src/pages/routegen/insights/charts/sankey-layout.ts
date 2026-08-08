import type { SankeyChartData, SankeyLinkDatum, SankeyNodeDatum } from '../user-flow'

// Sankey geometry, kept free of React so it can be unit-tested directly.
//
// The expensive half of a Sankey layout is deciding which column each node belongs in. The
// server already did it: every node carries stepDepth (its step in the session's event sequence)
// and every link spans depth d -> d+1. So this walks columns rather than recursing the graph, and
// never derives a node's column from the shape of the graph. What it does derive is the
// horizontal *spread*, which is normalised against the smallest depth present rather than
// assuming the first column is depth 0.

export type SankeyLayoutOptions = {
  width: number
  height: number
  nodeWidth: number
  nodePadding: number
  // Label gutters. Labels sit outside the end columns, so the plot area is inset.
  paddingLeft: number
  paddingRight: number
  paddingTop: number
  paddingBottom: number
}

export type LaidOutNode = SankeyNodeDatum & {
  // Sessions represented by this node — the larger of its inbound and outbound flow.
  value: number
  // Kept separately so a reader can show what arrived vs what carried on. Where a node has both
  // sides, inflow - outflow is the sessions that ended here — the number a drop-off question is
  // asking for. It is not a drop-off at the two ends of the flow: an entry node has inflow 0 and
  // a terminal node outflow 0, so the subtraction is meaningless there and the caller says
  // "Entry point" / "Flow ends here" instead.
  inflow: number
  outflow: number
  x: number
  y: number
  width: number
  height: number
}

// Ribbons are drawn as a stroked centre line, so sourceY/targetY are band centres and
// thickness is the stroke width.
export type LaidOutLink = SankeyLinkDatum & {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  thickness: number
}

export type SankeyLayout = {
  nodes: LaidOutNode[]
  links: LaidOutLink[]
}

const EMPTY: SankeyLayout = { nodes: [], links: [] }

// What the graph is shaped like, before any pixels are decided. The chart sizes its scroll
// canvas from this: the padding stack between a column's nodes is paid before any of them
// gets thickness, so a busy column needs height the viewport may not have.
export const sankeyExtent = (data: SankeyChartData) => {
  const perColumn = new Map<number, number>()
  for (const node of data.nodes) perColumn.set(node.stepDepth, (perColumn.get(node.stepDepth) ?? 0) + 1)
  if (perColumn.size === 0) return { widestColumn: 0, stepCount: 0 }

  const depths = [...perColumn.keys()]
  return {
    widestColumn: Math.max(...perColumn.values()),
    stepCount: Math.max(...depths) - Math.min(...depths) + 1,
  }
}

// A one-session node still has to be clickable and visible, so bands and ribbons never
// round down to nothing.
const MIN_NODE_HEIGHT = 2
const MIN_LINK_THICKNESS = 1

export const layoutSankey = (data: SankeyChartData, options: SankeyLayoutOptions): SankeyLayout => {
  const { nodes, links } = data
  if (nodes.length === 0 || links.length === 0) return EMPTY

  const plotWidth = options.width - options.paddingLeft - options.paddingRight
  const plotHeight = options.height - options.paddingTop - options.paddingBottom
  if (plotWidth <= 0 || plotHeight <= 0) return EMPTY

  // A node's weight is the larger of what flows in and what flows out. A step that sheds
  // sessions stays as tall as the traffic that reached it, so drop-off shows as the gap
  // between a node and the ribbons leaving it rather than silently shrinking the node.
  const inflow = nodes.map(() => 0)
  const outflow = nodes.map(() => 0)
  for (const link of links) {
    outflow[link.source] += link.value
    inflow[link.target] += link.value
  }
  const weights = nodes.map((_, index) => Math.max(inflow[index], outflow[index]))

  // Columns come straight from the server's step index.
  const columns = new Map<number, number[]>()
  for (let index = 0; index < nodes.length; index++) {
    const depth = nodes[index].stepDepth
    const column = columns.get(depth)
    if (column) column.push(index)
    else columns.set(depth, [index])
  }
  const depths = [...columns.keys()].sort((a, b) => a - b)
  const firstDepth = depths[0]
  // Span, not maximum: a flow whose depths start at 2 still has its first column at the left
  // edge. sankeyExtent measures the same way, and the two disagreeing would leave a third of the
  // canvas blank with every ribbon running backwards.
  const depthSpan = depths[depths.length - 1] - firstDepth

  // Biggest flow first, with the synthetic overflow bucket pinned to the bottom of its column.
  // Ordering is a pure function of the payload — two clients render the same column identically,
  // and the tie-break on name keeps equal-weight nodes from swapping — but it does re-rank when
  // the counts themselves change between refetches.
  for (const depth of depths) {
    const column = columns.get(depth)
    if (!column) continue
    column.sort((a, b) => {
      if (nodes[a].isOthers !== nodes[b].isOthers) return nodes[a].isOthers ? 1 : -1
      if (weights[b] !== weights[a]) return weights[b] - weights[a]
      return nodes[a].name.localeCompare(nodes[b].name)
    })
  }

  // One scale across every column, sized to the heaviest one. Per-column normalisation
  // would refill the height at each step and erase the attrition the chart exists to show.
  let heaviestColumn = 0
  let widestColumn = 0
  for (const depth of depths) {
    const column = columns.get(depth)
    if (!column) continue
    let total = 0
    for (const index of column) total += weights[index]
    if (total > heaviestColumn) heaviestColumn = total
    if (column.length > widestColumn) widestColumn = column.length
  }
  const gutters = Math.max(widestColumn - 1, 0) * options.nodePadding
  const scale = heaviestColumn > 0 ? Math.max(plotHeight - gutters, 1) / heaviestColumn : 0

  const columnX = (depth: number) => {
    if (depthSpan <= 0) return options.paddingLeft
    return options.paddingLeft + (plotWidth - options.nodeWidth) * ((depth - firstDepth) / depthSpan)
  }

  // Ribbons stack inside each node's band in the order of the counterpart node's
  // position, which is what keeps them from crossing over each other on the way out.
  const outgoing = new Map<number, number[]>()
  const incoming = new Map<number, number[]>()
  for (let index = 0; index < links.length; index++) {
    const from = outgoing.get(links[index].source)
    if (from) from.push(index)
    else outgoing.set(links[index].source, [index])

    const to = incoming.get(links[index].target)
    if (to) to.push(index)
    else incoming.set(links[index].target, [index])
  }

  const sourceY = new Array<number>(links.length).fill(0)
  const targetY = new Array<number>(links.length).fill(0)
  const thickness = links.map(link => Math.max(link.value * scale, MIN_LINK_THICKNESS))

  // Both floors round *up*, and they round up independently: a node worth a fraction of a pixel
  // becomes MIN_NODE_HEIGHT while each of its links becomes MIN_LINK_THICKNESS. Twenty
  // near-zero links off a 2px node stack 20px of ribbon into a 2px band and spill over the
  // nodes above and below. So a band is at least as tall as the thicker of the two stacks it
  // has to anchor — the node is what has to give, not the ribbons.
  const stackHeight = (linkIndexes: number[] | undefined) => {
    if (!linkIndexes) return 0
    let total = 0
    for (const linkIndex of linkIndexes) total += thickness[linkIndex]
    return total
  }
  const nodeHeights = weights.map((weight, index) =>
    Math.max(weight * scale, MIN_NODE_HEIGHT, stackHeight(outgoing.get(index)), stackHeight(incoming.get(index))),
  )

  const laidOutNodes = new Array<LaidOutNode>(nodes.length)
  for (const depth of depths) {
    const column = columns.get(depth)
    if (!column) continue

    let columnHeight = Math.max(column.length - 1, 0) * options.nodePadding
    for (const index of column) columnHeight += nodeHeights[index]

    // Lighter columns are centred rather than top-aligned, so the flow reads as a band
    // narrowing through the page instead of sagging away from a fixed top edge.
    let y = options.paddingTop + Math.max((plotHeight - columnHeight) / 2, 0)
    const x = columnX(depth)
    for (const index of column) {
      laidOutNodes[index] = {
        ...nodes[index],
        value: weights[index],
        inflow: inflow[index],
        outflow: outflow[index],
        x,
        y,
        width: options.nodeWidth,
        height: nodeHeights[index],
      }
      y += nodeHeights[index] + options.nodePadding
    }
  }

  for (const [nodeIndex, linkIndexes] of outgoing) {
    const node = laidOutNodes[nodeIndex]
    if (!node) continue
    linkIndexes.sort((a, b) => (laidOutNodes[links[a].target]?.y ?? 0) - (laidOutNodes[links[b].target]?.y ?? 0))
    let offset = node.y
    for (const linkIndex of linkIndexes) {
      sourceY[linkIndex] = offset + thickness[linkIndex] / 2
      offset += thickness[linkIndex]
    }
  }

  for (const [nodeIndex, linkIndexes] of incoming) {
    const node = laidOutNodes[nodeIndex]
    if (!node) continue
    linkIndexes.sort((a, b) => (laidOutNodes[links[a].source]?.y ?? 0) - (laidOutNodes[links[b].source]?.y ?? 0))
    let offset = node.y
    for (const linkIndex of linkIndexes) {
      targetY[linkIndex] = offset + thickness[linkIndex] / 2
      offset += thickness[linkIndex]
    }
  }

  const laidOutLinks = links.flatMap((link, index) => {
    const source = laidOutNodes[link.source]
    const target = laidOutNodes[link.target]
    if (!source || !target) return []
    return [
      {
        ...link,
        sourceX: source.x + source.width,
        sourceY: sourceY[index],
        targetX: target.x,
        targetY: targetY[index],
        thickness: thickness[index],
      },
    ]
  })

  // Not filtered: link.source/target are indices into this array, and the chart compares them
  // against positions in it. Dropping an element would silently renumber every link — wrong
  // ribbons, wrong hover, no error. Every node lands in exactly one column, so it is dense.
  return { nodes: laidOutNodes, links: laidOutLinks }
}

// Cubic with both control points at the horizontal midpoint: the ribbon leaves and enters
// its node horizontally, so it meets the node edge square rather than at an angle.
export const sankeyLinkPath = (link: LaidOutLink) => {
  const midX = (link.sourceX + link.targetX) / 2
  return `M${link.sourceX},${link.sourceY}C${midX},${link.sourceY} ${midX},${link.targetY} ${link.targetX},${link.targetY}`
}
