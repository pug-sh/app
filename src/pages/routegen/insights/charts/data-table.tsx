import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { SERIES_COLORS } from '../colors'
import { formatTooltipDate } from './helpers'
import { type ChartPoint } from './types'

export const DataTable = ({
  data,
  seriesNames,
  granularity,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  granularity: Granularity
}) => {
  if (data.length === 0) return null
  return (
    <div className='max-h-64 overflow-y-auto mt-4'>
      <table className='w-full'>
        <thead>
          <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
            <th className='py-2 pr-2 text-left font-medium sticky top-0 bg-background'>Date</th>
            {seriesNames.map((name, i) => (
              <th key={i} className='py-2 pr-2 text-right font-medium sticky top-0 bg-background'>
                <span className='flex items-center gap-1.5 justify-end'>
                  <span
                    className='w-2 h-2 rounded-full'
                    style={{ background: SERIES_COLORS[i % SERIES_COLORS.length].dot }}
                  />
                  {name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i} className='border-b border-border/50 transition-colors hover:bg-muted/40'>
              <td className='py-2 pr-2 text-xs text-muted-foreground'>{formatTooltipDate(d.date, granularity)}</td>
              {d.values.map((v, si) => (
                <td key={si} className='py-2 pr-2 text-right font-mono text-sm tabular-nums'>
                  {v.toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
