import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sankey, type SankeyLinkProps, type SankeyNodeProps, Tooltip } from 'recharts'
import { UserFlowQuery_GroupBy, type UserFlowResult } from '@/api/genproto/shared/insights/v1/insights_pb'
import { ChartContainer } from '@/components/ui/chart'
import { getSeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { buildSankeyData } from '../user-flow'

const createSankeyNode = (chartWidth: number) => {
  const SankeyNode = ({ x, y, width, height, payload }: SankeyNodeProps) => {
    const name = String(payload?.name ?? '')
    const color = getSeriesColor(name).line
    const labelOnRight = x + width / 2 < chartWidth / 2

    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.85} rx={2} />
        <text
          x={labelOnRight ? x + width + 6 : x - 6}
          y={y + height / 2}
          textAnchor={labelOnRight ? 'start' : 'end'}
          dominantBaseline="middle"
          className="fill-foreground text-[11px]"
        >
          {name}
        </text>
      </g>
    )
  }
  return SankeyNode
}

const SankeyLink = ({
  sourceX,
  targetX,
  sourceY,
  targetY,
  sourceControlX,
  targetControlX,
  linkWidth,
  payload,
}: SankeyLinkProps) => {
  const sourceName = String(payload?.source?.name ?? '')
  const color = getSeriesColor(sourceName).line

  return (
    <path
      d={`
        M${sourceX},${sourceY}
        C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
      `}
      fill="none"
      stroke={color}
      strokeOpacity={0.25}
      strokeWidth={Math.max(linkWidth, 1)}
    />
  )
}

export const SankeyChart = ({
  result,
  groupBy = UserFlowQuery_GroupBy.SESSION,
  className = 'h-[420px] w-full',
}: {
  result: UserFlowResult
  groupBy?: UserFlowQuery_GroupBy
  className?: string
}) => {
  const unitLabel = groupBy === UserFlowQuery_GroupBy.USER ? 'users' : 'sessions'
  const containerRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      setChartWidth(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const chartData = useMemo(() => {
    const { nodes, links } = buildSankeyData(result)
    return {
      nodes: nodes.map(node => ({
        ...node,
        color: getSeriesColor(node.name).line,
      })),
      links,
    }
  }, [result])

  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        chartData.nodes.map((node, index) => [String(index), { label: node.name, color: node.color }]),
      ),
    [chartData.nodes],
  )

  const SankeyNode = useMemo(() => createSankeyNode(chartWidth), [chartWidth])
  const renderNode = useCallback((props: SankeyNodeProps) => <SankeyNode {...props} />, [SankeyNode])
  const renderLink = useCallback((props: SankeyLinkProps) => <SankeyLink {...props} />, [])

  if (chartData.links.length === 0) return null

  return (
    <div ref={containerRef} className="h-full w-full min-h-0">
      <ChartContainer config={chartConfig} className={className}>
        <Sankey
          data={chartData}
          node={renderNode}
          link={renderLink}
          nodePadding={24}
          nodeWidth={12}
          margin={{ top: 16, right: 120, bottom: 16, left: 120 }}
          sort={false}
        >
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const item = payload[0]?.payload as
                | { source?: { name?: string }; target?: { name?: string }; value?: number }
                | undefined
              if (!item?.source || !item?.target) return null
              return (
                <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                  <p className="font-medium text-foreground">
                    {item.source.name} → {item.target.name}
                  </p>
                  <p className="mt-0.5 font-mono tabular-nums text-muted-foreground">
                    {compactNumber(item.value ?? 0)} {unitLabel}
                  </p>
                </div>
              )
            }}
          />
        </Sankey>
      </ChartContainer>
    </div>
  )
}
