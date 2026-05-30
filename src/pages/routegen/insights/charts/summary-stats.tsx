import { Fragment } from 'react'
import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ChartPoint } from './types'

type DetailStat = { label: string; value: string }

const breakdownDisplayName = (name: string) => {
  const sep = name.indexOf(' · ')
  if (sep >= 0) return name.slice(sep + 3)
  return '(direct)'
}

export const SummaryStats = ({
  series,
  data,
  seriesColors,
  aggregations,
  compact = false,
  showSeriesNames = false,
}: {
  series: string[]
  data: ChartPoint[]
  seriesColors: SeriesColor[]
  aggregations: AggregationType[]
  compact?: boolean
  showSeriesNames?: boolean
}) => {
  return (
    <div
      className={cn(
        'grid grid-cols-2',
        compact && showSeriesNames
          ? 'mb-0 gap-x-4 gap-y-2'
          : compact
            ? 'mb-0 gap-x-5 gap-y-4'
            : 'mb-1 gap-4 sm:grid-cols-4',
      )}
    >
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

        if (showSeriesNames) {
          return (
            <div key={si} className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: seriesColors[si]?.dot }} />
              <span className="truncate text-sm font-medium tabular-nums text-foreground">
                {compactNumber(headline)}
              </span>
              <span className="truncate text-xs text-muted-foreground">{breakdownDisplayName(name)}</span>
            </div>
          )
        }

        return (
          <div key={si} className="min-w-0 space-y-1">
            {!compact && (
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: seriesColors[si]?.dot }} />
                <span className="truncate text-[12px] font-medium text-muted-foreground">{name}</span>
              </div>
            )}
            <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-0')}>
              {compact && (
                <span className="size-2 shrink-0 rounded-full" style={{ background: seriesColors[si]?.dot }} />
              )}
              <p
                className={cn(
                  'truncate font-semibold leading-tight tracking-tight tabular-nums text-foreground',
                  compact ? 'text-lg' : 'text-[22px]',
                )}
              >
                {compactNumber(headline)}
              </p>
            </div>
            <p className="truncate text-[11px] leading-none">
              {stats.map((stat, i) => (
                <Fragment key={stat.label}>
                  {i > 0 && <span className="text-muted-foreground/30"> · </span>}
                  <span className="text-muted-foreground/60">{stat.label}</span>
                  <span className="ml-0.5 text-muted-foreground tabular-nums">{stat.value}</span>
                </Fragment>
              ))}
            </p>
          </div>
        )
      })}
    </div>
  )
}
