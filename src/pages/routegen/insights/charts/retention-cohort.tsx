import { Granularity, type Series } from '@/api/genproto/shared/insights/v1/insights_pb'
import { tsToDate } from '@/lib/timestamp'
import { formatTooltipDate } from './helpers'

type CohortRow = {
  label: string
  size: number
  values: number[]
}

const toPercent = (value: number, ratioInput: boolean) => {
  const percent = ratioInput ? value * 100 : value
  return Math.max(0, Math.min(100, percent))
}

const retentionColor = (value: number) => {
  if (value >= 80) return '#14532d'
  if (value >= 65) return '#166534'
  if (value >= 50) return '#15803d'
  if (value >= 35) return '#16a34a'
  if (value >= 20) return '#4ade80'
  if (value >= 10) return '#86efac'
  return '#dcfce7'
}

const formatCohortLabel = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return '—'
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  return trimmed
}

export const RetentionCohort = ({ series, granularity }: { series: Series[]; granularity: Granularity }) => {
  if (series.length === 0) return null

  const rawMax = Math.max(...series.flatMap(s => s.points.map(p => Number(p.value) || 0)), 0)
  const ratioInput = rawMax <= 1
  const columnCount = Math.max(...series.map(s => s.points.length), 0)
  const rows: CohortRow[] = series.map((s, i) => ({
    label: s.breakdown?.cohort || `Cohort ${i + 1}`,
    size: Math.max(0, Math.round(Number(s.total) || 0)),
    values: s.points.map(p => toPercent(Number(p.value) || 0, ratioInput)),
  }))

  return (
    <div className='mt-4 border border-border rounded-lg overflow-auto'>
      <div className='px-3 py-2 border-b border-border bg-muted/15 flex items-center justify-between gap-3'>
        <p className='text-xs text-muted-foreground'>Retention by cohort</p>
        <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
          <span>Low</span>
          {['#dcfce7', '#86efac', '#4ade80', '#16a34a', '#166534'].map((c, i) => (
            <span key={i} className='w-4 h-2 rounded-xs' style={{ backgroundColor: c }} />
          ))}
          <span>High</span>
        </div>
      </div>
      <table className='w-full min-w-170'>
        <thead>
          <tr className='border-b border-border bg-muted/20'>
            <th className='sticky left-0 z-20 bg-background py-2 px-3 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium min-w-55'>
              Cohort
            </th>
            <th className='sticky left-55 z-20 bg-background py-2 px-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium min-w-27.5 border-r border-border/60'>
              Total profiles
            </th>
            {Array.from({ length: columnCount }).map((_, col) => (
              <th key={col} className='py-2 px-3 text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium'>
                {col === 0 ? 'Start' : `+${col}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className='border-b last:border-b-0 border-border/50'>
              <td className='sticky left-0 z-10 bg-background py-2 px-3 text-xs text-foreground whitespace-nowrap min-w-55'>
                {formatCohortLabel(row.label)}
              </td>
              <td className='sticky left-55 z-10 bg-background py-2 px-2 text-left text-xs tabular-nums text-muted-foreground min-w-27.5 border-r border-border/60'>
                {row.size.toLocaleString()}
              </td>
              {Array.from({ length: columnCount }).map((_, ci) => {
                const value = row.values[ci]
                const hasValue = typeof value === 'number'
                const cellDate = series[ri]?.points[ci]?.time
                const title = hasValue
                  ? `${row.label} · ${formatTooltipDate(tsToDate(cellDate) ?? new Date(), granularity)} · ${value.toFixed(1)}%`
                  : `${row.label} · N/A`
                return (
                  <td key={ci} className='py-1.5 px-1.5'>
                    <div
                      className='h-8 rounded-[6px] text-[11px] tabular-nums flex items-center justify-end px-2'
                      style={{
                        backgroundColor: hasValue ? retentionColor(value) : 'hsl(var(--muted) / 0.35)',
                        color: hasValue && value >= 35 ? '#f8fafc' : 'hsl(var(--foreground))',
                      }}
                      title={title}
                    >
                      {hasValue ? `${Math.round(value)}%` : '—'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
