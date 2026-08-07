import type { SankeyChartData, SankeyLinkDatum, SankeyNodeDatum } from '../user-flow'

// Sankey geometry, kept free of React so it can be unit-tested directly.
//
// The expensive half of a Sankey layout is deciding which column each node belongs in.
// The server already did it: every node carries stepDepth (its 0-based step in the
// session's event sequence) and every link spans depth d -> d+1. So this walks columns
// rather than recursing the graph, and there is no depth inference to get wrong.

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
  // Kept separately so a reader can show what arrived vs what carried on. They differ by
  // the sessions that ended here, which is the number a drop-off question is asking for.
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
  const lastDepth = depths[depths.length - 1]

  // Biggest flow first, with the synthetic overflow bucket pinned to the bottom of its
  // column. Ordering is derived from the data alone, so it stays put across refetches
  // instead of reshuffling as counts drift.
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
    if (lastDepth <= 0) return options.paddingLeft
    return options.paddingLeft + (plotWidth - options.nodeWidth) * (depth / lastDepth)
  }

  const laidOutNodes = new Array<LaidOutNode>(nodes.length)
  for (const depth of depths) {
    const column = columns.get(depth)
    if (!column) continue

    let stackHeight = Math.max(column.length - 1, 0) * options.nodePadding
    for (const index of column) stackHeight += Math.max(weights[index] * scale, MIN_NODE_HEIGHT)

    // Lighter columns are centred rather than top-aligned, so the flow reads as a band
    // narrowing through the page instead of sagging away from a fixed top edge.
    let y = options.paddingTop + Math.max((plotHeight - stackHeight) / 2, 0)
    const x = columnX(depth)
    for (const index of column) {
      const height = Math.max(weights[index] * scale, MIN_NODE_HEIGHT)
      laidOutNodes[index] = {
        ...nodes[index],
        value: weights[index],
        inflow: inflow[index],
        outflow: outflow[index],
        x,
        y,
        width: options.nodeWidth,
        height,
      }
      y += height + options.nodePadding
    }
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

  return { nodes: laidOutNodes.filter(Boolean), links: laidOutLinks }
}

// Cubic with both control points at the horizontal midpoint: the ribbon leaves and enters
// its node horizontally, so it meets the node edge square rather than at an angle.
export const sankeyLinkPath = (link: LaidOutLink) => {
  const midX = (link.sourceX + link.targetX) / 2
  return `M${link.sourceX},${link.sourceY}C${midX},${link.sourceY} ${midX},${link.targetY} ${link.targetX},${link.targetY}`
}
