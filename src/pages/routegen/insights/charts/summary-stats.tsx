import { compactNumber } from '@/lib/format'
import type { SeriesColor } from '../colors'
import { type ChartPoint } from './types'

export const SummaryStats = ({
  series,
  data,
  seriesColors,
}: {
  series: string[]
  data: ChartPoint[]
  seriesColors: SeriesColor[]
}) => {
  return (
    <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1'>
      {series.map((name, si) => {
        const vals = data.map(d => d.values[si] ?? 0)
        const total = vals.reduce((a, b) => a + b, 0)
        const avg = vals.length > 0 ? total / vals.length : 0
        const max = Math.max(...vals, 0)
        return (
          <div key={si} className='flex items-start gap-2'>
            <span
              className='w-2 h-2 rounded-full mt-1.5 shrink-0'
              style={{ background: seriesColors[si]?.dot }}
            />
            <div className='min-w-0'>
              <p className='text-xs text-muted-foreground truncate'>{name}</p>
              <p className='text-lg font-semibold tabular-nums tracking-tight'>{compactNumber(total)}</p>
              <p className='text-[11px] text-muted-foreground'>
                avg {compactNumber(Math.round(avg))} &middot; peak {compactNumber(max)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
