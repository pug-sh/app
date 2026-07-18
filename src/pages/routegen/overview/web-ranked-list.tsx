import { getIndexedColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RankedRow } from './web-breakdown'

const OTHERS_KEY = '$__others'

// Ranked horizontal-bar list for the web-analytics breakdown panels. Shares the visual language of
// insights' TopKList (rank · label · share bar · value · %) but takes already-resolved RankedRows, so
// it renders top-K results and collapsed session breakdowns identically.
//
// `showShare` is the caller's promise that the rows sum to a meaningful total: true for top-K (the
// $others bucket captures the tail, so the total is whole), false for session breakdowns (sliced to
// top-N with no overflow bucket, so a "% of total" would silently mean "% of shown").
//
// When `onRowClick` is provided, real (non-muted) rows become buttons that cross-filter the page;
// `isActive` marks rows already in the filter set.
export const WebRankedList = ({
  rows,
  showShare = false,
  onRowClick,
  isActive,
}: {
  rows: RankedRow[]
  showShare?: boolean
  onRowClick?: (row: RankedRow) => void
  isActive?: (row: RankedRow) => boolean
}) => {
  if (rows.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-muted-foreground/70">No data</div>
  }

  const maxValue = Math.max(...rows.map(row => row.value), 0)
  const total = rows.reduce((sum, row) => sum + row.value, 0)

  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden">
      {rows.map((row, index) => {
        const active = isActive?.(row) ?? false
        const canClick = !!onRowClick && !row.muted
        const barColor = row.muted ? 'var(--muted-foreground)' : getIndexedColor(index).dot
        const barWidth = maxValue > 0 ? Math.max((row.value / maxValue) * 100, 0.5) : 0

        const content = (
          <>
            <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">
              {row.key === OTHERS_KEY ? '·' : index + 1}
            </span>
            <div className="w-28 min-w-0 shrink-0 text-xs">
              <span
                className={cn(
                  'block truncate',
                  row.muted && 'text-muted-foreground',
                  active && 'font-medium text-foreground',
                )}
                title={row.label}
              >
                {row.label}
              </span>
            </div>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full"
                style={{ width: `${barWidth}%`, background: barColor, opacity: row.muted ? 0.35 : 0.8 }}
              />
            </div>
            <span
              className="w-16 shrink-0 text-right text-xs font-medium tabular-nums"
              title={row.value.toLocaleString('en-US', { maximumFractionDigits: 6 })}
            >
              {compactNumber(row.value)}
            </span>
            {showShare && (
              <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {total > 0 ? `${((row.value / total) * 100).toFixed(1)}%` : '—'}
              </span>
            )}
          </>
        )

        const rowClass = cn(
          '-mx-2 flex items-center gap-3 rounded-sm border-b border-border/50 px-2 py-1.5 text-left transition-colors last:border-0',
          active && 'bg-primary/5',
          canClick ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default',
        )

        if (canClick) {
          return (
            <button
              key={row.key}
              type="button"
              aria-pressed={active}
              onClick={() => onRowClick?.(row)}
              className={cn(rowClass, 'w-full')}
            >
              {content}
            </button>
          )
        }
        return (
          <div key={row.key} className={rowClass}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
