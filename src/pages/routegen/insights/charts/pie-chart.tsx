import { Pie } from '@visx/shape'
import { useEffect, useState } from 'react'
import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { collapseValues, SERIES_COLLAPSE } from '../helpers'
import type { ChartPoint } from './types'

export type PieSlice = {
  name: string
  value: number
  color: string
}

const OTHERS_NAME = 'Others'

const pieName = (name: string) => (name === '$others' ? OTHERS_NAME : name)

export const buildPieSlices = (
  data: ChartPoint[],
  seriesNames: string[],
  seriesColors: SeriesColor[],
  aggregations: AggregationType[],
) =>
  seriesNames.map((name, index) => {
    const values = data.map(point => point.values[index] ?? 0)
    const aggregation = aggregations[index] ?? AggregationType.TOTAL
    return {
      name: pieName(name),
      value: collapseValues(values, SERIES_COLLAPSE[aggregation]),
      color: seriesColors[index]?.line ?? 'var(--muted-foreground)',
    }
  })

const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(1)}%`
const labelName = (name: string, maxLength = 16) =>
  name.length > maxLength ? `${name.slice(0, maxLength - 1)}…` : name

// Labels on very small arcs collide more than they help. Those slices remain
// named in the legend, through keyboard focus, and in the donut centre.
const MIN_LABEL_SHARE = 0.08

export const PieChart = ({
  data,
  seriesNames,
  seriesColors,
  aggregations,
  compact = false,
  showLabels = true,
  className,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  seriesColors: SeriesColor[]
  aggregations: AggregationType[]
  compact?: boolean
  showLabels?: boolean
  className?: string
}) => {
  const [activeName, setActiveName] = useState<string | null>(null)
  const collapsed = buildPieSlices(data, seriesNames, seriesColors, aggregations)
  const hasNegativeValue = collapsed.some(slice => slice.value < 0)
  const slices = collapsed.filter(slice => slice.value > 0)
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const active = slices.find(slice => slice.name === activeName) ?? null

  useEffect(() => {
    if (activeName !== null && !active) setActiveName(null)
  }, [active, activeName])

  if (hasNegativeValue) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Pie charts require non-negative values
      </div>
    )
  }

  if (total === 0) return null

  return (
    <div
      className={cn(
        'flex min-h-64 w-full items-center justify-center',
        // Dashboard tiles have user-controlled width and height. Let the SVG's viewBox fit the
        // smaller available dimension rather than imposing a minimum height that gets clipped by
        // the tile shell.
        compact && 'h-full min-h-0 min-w-0',
        className,
      )}
    >
      <svg
        viewBox="-160 -160 320 320"
        preserveAspectRatio="xMidYMid meet"
        className={cn('block aspect-square w-full max-w-72', compact && 'h-full min-h-0 max-h-full max-w-full')}
        role="group"
        aria-label="Pie chart"
      >
        <Pie<PieSlice>
          data={slices}
          pieValue={slice => slice.value}
          pieSort={null}
          pieSortValues={null}
          outerRadius={138}
          innerRadius={78}
          cornerRadius={3}
          padAngle={0.012}
        >
          {({ arcs, path }) =>
            arcs.map((arc, index) => {
              const [labelX, labelY] = path.centroid(arc)
              const share = arc.data.value / total
              return (
                <g key={`${index}-${arc.data.name}`}>
                  <path
                    d={path(arc) ?? undefined}
                    fill={arc.data.color}
                    opacity={active === null || active.name === arc.data.name ? 0.9 : 0.3}
                    className="outline-none transition-opacity focus:opacity-100"
                    data-pie-slice={arc.data.name}
                    tabIndex={0}
                    role="img"
                    aria-label={`${arc.data.name}: ${arc.data.value.toLocaleString()} (${percent(arc.data.value, total)})`}
                    onMouseEnter={() => setActiveName(arc.data.name)}
                    onMouseLeave={() => setActiveName(null)}
                    onFocus={() => setActiveName(arc.data.name)}
                    onBlur={() => setActiveName(null)}
                  />
                  {showLabels && share >= MIN_LABEL_SHARE ? (
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none fill-white text-xs font-medium"
                      stroke="rgba(0, 0, 0, 0.45)"
                      strokeWidth="2.5"
                      paintOrder="stroke"
                      aria-hidden
                      data-pie-label={arc.data.name}
                    >
                      <tspan x={labelX} dy="-0.55em">
                        {labelName(arc.data.name)}
                      </tspan>
                      <tspan x={labelX} dy="1.2em" className="tabular-nums">
                        {percent(arc.data.value, total)}
                      </tspan>
                    </text>
                  ) : null}
                </g>
              )
            })
          }
        </Pie>
        <text
          textAnchor="middle"
          y="-4"
          className="fill-foreground text-[22px] font-medium tabular-nums"
          data-pie-active-label
        >
          {active ? labelName(active.name, 18) : compactNumber(total)}
        </text>
        <text textAnchor="middle" y="18" className="fill-muted-foreground text-xs">
          {active ? `${compactNumber(active.value)} · ${percent(active.value, total)}` : 'total'}
        </text>
      </svg>
    </div>
  )
}
