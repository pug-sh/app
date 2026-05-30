import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ChartPoint } from './types'

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
        let detail = `avg ${compactNumber(Math.round(avg))} · peak ${compactNumber(max)}`

        if (aggregation === AggregationType.AVG) {
          headline = avg
          detail = `min ${compactNumber(min)} · max ${compactNumber(max)}`
        } else if (aggregation === AggregationType.MIN) {
          headline = min
          detail = `avg ${compactNumber(Math.round(avg))} · peak ${compactNumber(max)}`
        } else if (aggregation === AggregationType.MAX) {
          headline = max
          detail = `avg ${compactNumber(Math.round(avg))} · floor ${compactNumber(min)}`
        }
        return (
          <div key={si} className="flex min-w-0 items-start gap-2.5">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: seriesColors[si]?.dot }} />
            <div className="min-w-0 space-y-0.5">
              {!compact && <p className="truncate text-xs text-muted-foreground">{name}</p>}
              <p
                className={cn(
                  'text-lg font-medium tabular-nums tracking-tight text-foreground',
                  compact && 'truncate',
                )}
              >
                {compactNumber(headline)}
              </p>
              <p className={cn('text-[11px] text-muted-foreground/70', compact && 'truncate')}>{detail}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
