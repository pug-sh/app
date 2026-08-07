import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { UserFlowResult } from '@/api/genproto/shared/insights/v1/insights_pb'
import { resolvedThemeAtom } from '@/data/theme.atoms'
import { getSeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { buildSankeyData } from '../user-flow'
import { layoutSankey, sankeyExtent, sankeyLinkPath } from './sankey-layout'

const NODE_WIDTH = 12
const NODE_PADDING = 18
const PADDING_Y = 16
// Gap between a node and its label.
const LABEL_OFFSET = 6

// Only used to size the label gutters and to decide when a name needs an ellipsis — event
// names are lowercase and underscored, so they run narrower than the all-digit worst case
// the axis fitter calibrates against. An underestimate clips a character, not the layout,
// and the hover card carries the untruncated name either way.
const LABEL_PX_PER_CHAR = 6.6
const MIN_GUTTER = 72
// Past this the labels start costing the flow more room than they are worth.
const MAX_GUTTER_RATIO = 0.24

// Pixels the busiest column's bands get to share, over and above the padding between its
// nodes. A column pays that padding first, so on a short viewport a 20-node step spends
// everything on gaps and draws every band as a hairline. Below this the chart grows its own
// canvas and the container scrolls instead of compressing.
const MIN_FLOW_HEIGHT = 260
// Enough room for a label to sit between two columns without reaching the next one.
const MIN_COLUMN_WIDTH = 170

const truncateLabel = (text: string, maxPx: number) => {
  const maxChars = Math.floor(maxPx / LABEL_PX_PER_CHAR)
  if (text.length <= maxChars) return text
  if (maxChars <= 1) return '…'
  return `${text.slice(0, maxChars - 1)}…`
}

type Hover = { kind: 'link' | 'node'; index: number; x: number; y: number }

export const SankeyChart = ({
  result,
  className = 'h-[420px] w-full',
}: {
  result: UserFlowResult
  className?: string
}) => {
  const unitLabel = 'sessions'
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hovered, setHovered] = useState<Hover | null>(null)
  // Series colors are theme-adapted, and a module mutation can't invalidate a useMemo —
  // subscribe so the palettes below re-derive on a theme toggle.
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      setSize({ width: rect?.width ?? 0, height: rect?.height ?? 0 })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const sankeyData = useMemo(() => buildSankeyData(result), [result])

  // Only the end columns read into a gutter, so they are the only ones that size it. Both
  // are measured independently — a long name on the left shouldn't cost the right column
  // room it doesn't need.
  const gutters = useMemo(() => {
    const { nodes } = sankeyData
    if (nodes.length === 0 || size.width <= 0) return { left: MIN_GUTTER, right: MIN_GUTTER }

    const depths = nodes.map(node => node.stepDepth)
    const cap = Math.max(size.width * MAX_GUTTER_RATIO, MIN_GUTTER)
    const widestAt = (depth: number) => {
      let chars = 0
      for (const node of nodes) {
        if (node.stepDepth === depth) chars = Math.max(chars, node.name.length)
      }
      return chars * LABEL_PX_PER_CHAR + LABEL_OFFSET * 2
    }

    return {
      left: Math.min(Math.max(widestAt(Math.min(...depths)), MIN_GUTTER), cap),
      right: Math.min(Math.max(widestAt(Math.max(...depths)), MIN_GUTTER), cap),
    }
  }, [sankeyData, size.width])

  // The canvas is the viewport until the graph outgrows it, then it is whatever the graph
  // needs and the container scrolls. Drawing into the viewport regardless is what turns a
  // busy flow into hairlines.
  const canvas = useMemo(() => {
    const { widestColumn, stepCount } = sankeyExtent(sankeyData)
    const neededHeight = PADDING_Y * 2 + Math.max(widestColumn - 1, 0) * NODE_PADDING + MIN_FLOW_HEIGHT
    const neededWidth = gutters.left + gutters.right + NODE_WIDTH + Math.max(stepCount - 1, 0) * MIN_COLUMN_WIDTH

    return {
      width: Math.max(size.width, neededWidth),
      height: Math.max(size.height, neededHeight),
    }
  }, [sankeyData, size.width, size.height, gutters])

  const layout = useMemo(
    () =>
      layoutSankey(sankeyData, {
        width: canvas.width,
        height: canvas.height,
        nodeWidth: NODE_WIDTH,
        nodePadding: NODE_PADDING,
        paddingLeft: gutters.left,
        paddingRight: gutters.right,
        paddingTop: PADDING_Y,
        paddingBottom: PADDING_Y,
      }),
    [sankeyData, canvas, gutters],
  )

  const nodeColors = useMemo(
    () => layout.nodes.map(node => getSeriesColor(node.name).line),
    [layout.nodes, resolvedTheme],
  )
  const linkColors = useMemo(
    () => layout.links.map(link => getSeriesColor(link.sourceName).line),
    [layout.links, resolvedTheme],
  )

  const depths = layout.nodes.map(node => node.stepDepth)
  const firstDepth = depths.length > 0 ? Math.min(...depths) : 0
  const lastDepth = depths.length > 0 ? Math.max(...depths) : 0

  // A middle column's label reads into the gap before the next column, which is far wider
  // than a gutter — sizing it by the gutter truncated names that had room to spare.
  const columnXs = [...new Set(layout.nodes.map(node => node.x))].sort((a, b) => a - b)
  const columnGap = columnXs.length > 1 ? columnXs[1] - columnXs[0] : canvas.width
  const labelWidth = (depth: number) => {
    if (depth === firstDepth) return gutters.left - LABEL_OFFSET * 2
    if (depth === lastDepth) return gutters.right - LABEL_OFFSET * 2
    return columnGap - NODE_WIDTH - LABEL_OFFSET * 2
  }

  const hoveredLink = hovered?.kind === 'link' ? layout.links[hovered.index] : undefined
  const hoveredNode = hovered?.kind === 'node' ? layout.nodes[hovered.index] : undefined

  // A node's own ribbons stay lit while it is hovered, so the hover answers "where did
  // these sessions come from and go" without a second interaction.
  const isLinkLit = (index: number) => {
    if (hovered?.kind === 'link') return hovered.index === index
    if (hovered?.kind === 'node') {
      const link = layout.links[index]
      return link.source === hovered.index || link.target === hovered.index
    }
    return false
  }

  // The card is positioned inside the scroll container, so its coordinates are
  // content-relative: without the scroll offsets it drifts by however far the flow has been
  // scrolled.
  const track = (kind: Hover['kind'], index: number) => (event: { clientX: number; clientY: number }) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setHovered({
      kind,
      index,
      x: event.clientX - rect.left + el.scrollLeft,
      y: event.clientY - rect.top + el.scrollTop,
    })
  }

  if (sankeyData.links.length === 0) return null

  return (
    <div ref={containerRef} className={`relative min-h-0 overflow-auto ${className}`}>
      {canvas.width > 0 && canvas.height > 0 ? (
        <svg width={canvas.width} height={canvas.height} role="img" aria-label="User flow between steps">
          <g>
            {layout.links.map((link, index) => (
              <path
                key={`${link.source}-${link.target}-${index}`}
                d={sankeyLinkPath(link)}
                fill="none"
                stroke={linkColors[index]}
                strokeOpacity={isLinkLit(index) ? 0.5 : 0.25}
                strokeWidth={Math.max(link.thickness, 1)}
                onMouseMove={track('link', index)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </g>

          <g>
            {layout.nodes.map((node, index) => (
              <rect
                key={node.id}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                fill={nodeColors[index]}
                fillOpacity={hovered?.kind === 'node' && hovered.index === index ? 1 : 0.85}
                rx={2}
                onMouseMove={track('node', index)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </g>

          {/* Labels last so they stay legible over the ribbons they cross. */}
          <g>
            {layout.nodes.map((node, index) => {
              // The first column reads into the left gutter; every other column reads
              // rightward, which keeps the last column's text inside the right gutter.
              const onLeft = node.stepDepth === firstDepth
              return (
                <text
                  key={node.id}
                  x={onLeft ? node.x - LABEL_OFFSET : node.x + node.width + LABEL_OFFSET}
                  y={node.y + node.height / 2}
                  textAnchor={onLeft ? 'end' : 'start'}
                  dominantBaseline="middle"
                  className="cursor-default fill-foreground text-xs"
                  onMouseMove={track('node', index)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {truncateLabel(node.name, labelWidth(node.stepDepth))}
                </text>
              )
            })}
          </g>
        </svg>
      ) : null}

      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: hovered.x,
            top: hovered.y,
            transform: `translate(${hovered.x > canvas.width / 2 ? 'calc(-100% - 8px)' : '8px'}, -50%)`,
          }}
        >
          {hoveredLink ? (
            <>
              <p className="font-medium text-foreground">
                {hoveredLink.sourceName} → {hoveredLink.targetName}
              </p>
              <p className="mt-0.5 font-mono tabular-nums text-muted-foreground">
                {compactNumber(hoveredLink.value)} {unitLabel}
              </p>
            </>
          ) : null}

          {hoveredNode ? <NodeSummary node={hoveredNode} unitLabel={unitLabel} /> : null}
        </div>
      ) : null}
    </div>
  )
}

// Entry and terminal nodes have only one side, so each gets the sentence that is true for
// it rather than a "0 continued" that reads like a bug.
const NodeSummary = ({
  node,
  unitLabel,
}: {
  node: { name: string; stepDepth: number; inflow: number; outflow: number; value: number }
  unitLabel: string
}) => {
  const ended = Math.max(node.inflow - node.outflow, 0)
  const share = node.inflow > 0 ? Math.round((node.outflow / node.inflow) * 100) : null

  return (
    <>
      <p className="font-medium text-foreground">{node.name}</p>
      <p className="mt-0.5 text-muted-foreground">Step {node.stepDepth + 1}</p>
      <p className="mt-1 font-mono tabular-nums text-foreground">
        {compactNumber(node.value)} {unitLabel}
      </p>
      {node.inflow === 0 ? <p className="mt-0.5 text-muted-foreground">Entry point</p> : null}
      {node.inflow > 0 && node.outflow === 0 ? <p className="mt-0.5 text-muted-foreground">Flow ends here</p> : null}
      {node.inflow > 0 && node.outflow > 0 && ended > 0 ? (
        <p className="mt-0.5 font-mono tabular-nums text-muted-foreground">
          {compactNumber(node.outflow)} continued{share === null ? '' : ` (${share}%)`} · {compactNumber(ended)} ended
        </p>
      ) : null}
      {node.inflow > 0 && node.outflow > 0 && ended === 0 ? (
        <p className="mt-0.5 text-muted-foreground">All continued</p>
      ) : null}
    </>
  )
}
