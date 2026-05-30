import { Fragment } from 'react'
import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ChartPoint } from './types'

type DetailStat = { label: string; value: string }

export const SummaryStats = ({
  series,
  data,
  seriesColors,
  aggregations,
  compact = false,
}: {
  series: string[]
  data: ChartPoint[]
  seriesColors: SeriesColor[]
  aggregations: AggregationType[]
  compact?: boolean
}) => {
  return (
    <div className={cn('grid grid-cols-2', compact ? 'mb-0 gap-x-5 gap-y-3' : 'mb-1 gap-3 sm:grid-cols-4')}>
      {series.map((name, si) => {
        const vals = data.map(d => d.values[si] ?? 0)
        const total = vals.reduce((a, b) => a + b, 0)
        const avg = vals.length > 0 ? total / vals.length : 0
        const min = vals.length > 0 ? Math.min(...vals) : 0
        const max = Math.max(...vals, 0)
        const aggregation = aggregations[si] ?? AggregationType.TOTAL

        let headline = total
        let stats: DetailStat[] = [
          { label: 'avg', value: compactNumber(Math.round(avg)) },
          { label: 'peak', value: compactNumber(max) },
        ]

        if (aggregation === AggregationType.AVG) {
          headline = avg
          stats = [
            { label: 'min', value: compactNumber(min) },
            { label: 'max', value: compactNumber(max) },
          ]
        } else if (aggregation === AggregationType.MIN) {
          headline = min
          stats = [
            { label: 'avg', value: compactNumber(Math.round(avg)) },
            { label: 'peak', value: compactNumber(max) },
          ]
        } else if (aggregation === AggregationType.MAX) {
          headline = max
          stats = [
            { label: 'avg', value: compactNumber(Math.round(avg)) },
            { label: 'floor', value: compactNumber(min) },
          ]
        }

        return (
          <div key={si} className="min-w-0">
            {!compact && <p className="mb-0.5 truncate text-xs text-muted-foreground">{name}</p>}
            <div className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: seriesColors[si]?.dot }} />
              <p className="truncate text-lg font-medium tracking-tight tabular-nums text-foreground">
                {compactNumber(headline)}
              </p>
            </div>
            <p className="mt-0.5 truncate pl-4 text-[11px]">
              {stats.map((stat, i) => (
                <Fragment key={stat.label}>
                  {i > 0 && <span className="text-muted-foreground/40"> · </span>}
                  <span className="text-muted-foreground/50">{stat.label} </span>
                  <span className="text-muted-foreground tabular-nums">{stat.value}</span>
                </Fragment>
              ))}
            </p>
          </div>
        )
      })}
    </div>
  )
}
