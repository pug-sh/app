import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { UserFlowResult } from '@/api/genproto/shared/insights/v1/insights_pb'
import { resolvedThemeAtom } from '@/data/theme.atoms'
import { getSeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { buildSankeyData } from '../user-flow'
import { layoutSankey, sankeyLinkPath } from './sankey-layout'

const NODE_WIDTH = 12
const NODE_PADDING = 18
// Gutters for the labels that sit outside the first and last columns.
const PADDING_X = 104
const PADDING_Y = 16

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
  const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null)
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

  const layout = useMemo(
    () =>
      layoutSankey(sankeyData, {
        width: size.width,
        height: size.height,
        nodeWidth: NODE_WIDTH,
        nodePadding: NODE_PADDING,
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X,
        paddingTop: PADDING_Y,
        paddingBottom: PADDING_Y,
      }),
    [sankeyData, size.width, size.height],
  )

  const nodeColors = useMemo(
    () => layout.nodes.map(node => getSeriesColor(node.name).line),
    [layout.nodes, resolvedTheme],
  )
  const linkColors = useMemo(
    () => layout.links.map(link => getSeriesColor(link.sourceName).line),
    [layout.links, resolvedTheme],
  )

  const firstDepth = layout.nodes.length > 0 ? Math.min(...layout.nodes.map(node => node.stepDepth)) : 0
  const hoveredLink = hovered === null ? undefined : layout.links[hovered.index]

  if (sankeyData.links.length === 0) return null

  return (
    <div ref={containerRef} className={`relative min-h-0 ${className}`}>
      {size.width > 0 && size.height > 0 ? (
        <svg width={size.width} height={size.height} role="img" aria-label="User flow between steps">
          <g>
            {layout.links.map((link, index) => (
              <path
                key={`${link.source}-${link.target}-${index}`}
                d={sankeyLinkPath(link)}
                fill="none"
                stroke={linkColors[index]}
                strokeOpacity={hovered?.index === index ? 0.5 : 0.25}
                strokeWidth={Math.max(link.thickness, 1)}
                onMouseMove={event => {
                  const rect = containerRef.current?.getBoundingClientRect()
                  if (!rect) return
                  setHovered({ index, x: event.clientX - rect.left, y: event.clientY - rect.top })
                }}
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
                fillOpacity={0.85}
                rx={2}
              />
            ))}
          </g>

          {/* Labels last so they stay legible over the ribbons they cross. */}
          <g>
            {layout.nodes.map(node => {
              // The first column reads into the left gutter; every other column reads
              // rightward, which keeps the last column's text inside the right gutter.
              const onLeft = node.stepDepth === firstDepth
              return (
                <text
                  key={node.id}
                  x={onLeft ? node.x - 6 : node.x + node.width + 6}
                  y={node.y + node.height / 2}
                  textAnchor={onLeft ? 'end' : 'start'}
                  dominantBaseline="middle"
                  className="fill-foreground text-xs"
                >
                  {node.name}
                </text>
              )
            })}
          </g>
        </svg>
      ) : null}

      {hovered && hoveredLink ? (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: hovered.x,
            top: hovered.y,
            transform: `translate(${hovered.x > size.width / 2 ? '-100%' : '0'}, -50%)`,
          }}
        >
          <p className="font-medium text-foreground">
            {hoveredLink.sourceName} → {hoveredLink.targetName}
          </p>
          <p className="mt-0.5 font-mono tabular-nums text-muted-foreground">
            {compactNumber(hoveredLink.value)} {unitLabel}
          </p>
        </div>
      ) : null}
    </div>
  )
}
