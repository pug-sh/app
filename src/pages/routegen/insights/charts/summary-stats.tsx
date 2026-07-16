import { Fragment } from 'react'
import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isPerBucketAggregation } from '../helpers'
import type { ChartPoint } from './types'

type DetailStat = { label: string; value: string }

export const SummaryStats = ({
  series,
  data,
  seriesColors,
  aggregations,
  compact = false,
  showSeriesNames = false,
  lightNumbers = false,
}: {
  series: string[]
  data: ChartPoint[]
  seriesColors: SeriesColor[]
  aggregations: AggregationType[]
  compact?: boolean
  showSeriesNames?: boolean
  lightNumbers?: boolean
}) => {
  const inlineWeight = lightNumbers ? 'font-normal' : 'font-medium'
  return (
    <div
      className={cn(
        // Width-driven columns: tiles and the insights panel size independently of the
        // viewport, so fit as many fixed-width tracks as the container allows rather than
        // capping at a viewport breakpoint. min(100%, …) keeps a single track from
        // overflowing a very narrow tile.
        'grid',
        compact && showSeriesNames
          ? 'mb-0 grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))] gap-x-4 gap-y-2'
          : compact
            ? 'mb-0 grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-x-5 gap-y-4'
            : 'mb-1 grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-4',
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

        if (isPerBucketAggregation(aggregation)) {
          // Not summable across buckets, which is what the `total` default above would do — see
          // isPerBucketAggregation. Lead with the per-bucket average, which is what this data can
          // honestly say.
          headline = avg
          stats = [
            { label: 'peak', value: compactNumber(max) },
            { label: 'floor', value: compactNumber(min) },
          ]
        } else if (aggregation === AggregationType.AVG) {
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
              <span className={cn('shrink-0 whitespace-nowrap text-sm tabular-nums text-foreground', inlineWeight)}>
                {compactNumber(headline)}
              </span>
              <span className="truncate text-xs text-muted-foreground">{name}</span>
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
                  'whitespace-nowrap leading-tight tracking-tight tabular-nums text-foreground',
                  'font-medium',
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
