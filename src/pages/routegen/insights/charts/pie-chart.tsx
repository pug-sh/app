import { Pie } from '@visx/shape'
import { useEffect, useState } from 'react'
import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { collapseValues, SERIES_COLLAPSE } from '../helpers'
import type { ChartPoint } from './types'

type PieSlice = {
  name: string
  value: number
  color: string
}

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
      name,
      value: collapseValues(values, SERIES_COLLAPSE[aggregation]),
      color: seriesColors[index]?.line ?? 'var(--muted-foreground)',
    }
  })

const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(1)}%`

export const PieChart = ({
  data,
  seriesNames,
  seriesColors,
  aggregations,
  compact = false,
  className,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  seriesColors: SeriesColor[]
  aggregations: AggregationType[]
  compact?: boolean
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
        'grid min-h-64 w-full items-center gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]',
        compact && 'min-h-0 gap-3',
        className,
      )}
    >
      <div className={cn('flex min-h-52 items-center justify-center', compact && 'min-h-32')}>
        <svg
          viewBox="-160 -160 320 320"
          className={cn('size-full max-h-72 max-w-72', compact && 'max-h-56 max-w-56')}
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
              arcs.map((arc, index) => (
                <path
                  key={`${index}-${arc.data.name}`}
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
              ))
            }
          </Pie>
          <text textAnchor="middle" y="-4" className="fill-foreground text-[22px] font-medium tabular-nums">
            {compactNumber(active?.value ?? total)}
          </text>
          <text textAnchor="middle" y="18" className="fill-muted-foreground text-xs">
            {active ? percent(active.value, total) : 'total'}
          </text>
        </svg>
      </div>

      <ul className={cn('min-w-0 space-y-1', compact && 'max-h-full overflow-y-auto')}>
        {slices.map((slice, index) => (
          <li
            key={`${index}-${slice.name}`}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active !== null && active.name !== slice.name && 'opacity-40',
            )}
            tabIndex={0}
            onMouseEnter={() => setActiveName(slice.name)}
            onMouseLeave={() => setActiveName(null)}
            onFocus={() => setActiveName(slice.name)}
            onBlur={() => setActiveName(null)}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
            <span className="min-w-0 flex-1 truncate text-xs" title={slice.name}>
              {slice.name}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{compactNumber(slice.value)}</span>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-faint">
              {percent(slice.value, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
