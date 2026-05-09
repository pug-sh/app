import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import type { ChartPoint } from './types'

export const SummaryStats = ({
  series,
  data,
  seriesColors,
  aggregations,
}: {
  series: string[]
  data: ChartPoint[]
  seriesColors: SeriesColor[]
  aggregations: AggregationType[]
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
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
          <div key={si} className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: seriesColors[si]?.dot }} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{name}</p>
              <p className="text-lg font-semibold tabular-nums tracking-tight">{compactNumber(headline)}</p>
              <p className="text-[11px] text-muted-foreground">{detail}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
