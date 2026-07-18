import type { ReactNode } from 'react'
import { getIndexedColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RankedRow } from './web-breakdown'

// Ranked list for the web-analytics breakdown panels, in the "row is the bar" style: each row carries a
// left-anchored background fill sized to its share of the top value, with the label (and optional
// leading glyph) reading over it and the value + share pinned right. Takes already-resolved RankedRows,
// so top-K results and collapsed session breakdowns render identically.
//
// `showShare` is the caller's promise that the rows sum to a meaningful total: true for top-K (the
// $others bucket captures the tail, so the total is whole), false for session breakdowns (sliced to
// top-N with no overflow bucket, so a "% of total" would silently mean "% of shown").
//
// When `onRowClick` is provided, real (non-muted) rows become buttons that cross-filter the page;
// `isActive` marks rows already in the filter set.
//
// `renderLeading` fills an optional fixed-size slot before each label (domain favicons, country
// flags, brand icons). Return a same-size spacer for rows that shouldn't carry one so labels stay
// aligned. `formatLabel` overrides the displayed text (e.g. country code → name); the row's raw label
// is still the filter/query key, so only presentation changes.
//
// `dimensionLabel` + `metricControl` render a sticky column header aligned to the value/share columns:
// the dimension name on the left, the metric name (or a metric picker) over the value column.
export const WebRankedList = ({
  rows,
  showShare = false,
  onRowClick,
  isActive,
  renderLeading,
  formatLabel,
  dimensionLabel,
  metricControl,
}: {
  rows: RankedRow[]
  showShare?: boolean
  onRowClick?: (row: RankedRow) => void
  isActive?: (row: RankedRow) => boolean
  renderLeading?: (row: RankedRow) => ReactNode
  formatLabel?: (row: RankedRow) => string
  dimensionLabel?: string
  metricControl?: ReactNode
}) => {
  if (rows.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-muted-foreground/70">No data</div>
  }

  const maxValue = Math.max(...rows.map(row => row.value), 0)
  const total = rows.reduce((sum, row) => sum + row.value, 0)

  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden">
      {dimensionLabel && (
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border/50 bg-background px-2 pt-0.5 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          <span className="min-w-0 flex-1 truncate">{dimensionLabel}</span>
          <span className="flex w-20 shrink-0 justify-end">{metricControl}</span>
          {showShare && <span className="w-11 shrink-0 text-right">%</span>}
        </div>
      )}
      {rows.map((row, index) => {
        const active = isActive?.(row) ?? false
        const label = formatLabel ? formatLabel(row) : row.label
        const canClick = !!onRowClick && !row.muted
        const fill = row.muted ? 'var(--muted-foreground)' : getIndexedColor(index).dot
        const barWidth = maxValue > 0 ? Math.max((row.value / maxValue) * 100, 0.5) : 0

        const content = (
          <>
            <span
              className="absolute inset-y-0.5 left-0 rounded-md"
              style={{ width: `${barWidth}%`, background: fill, opacity: row.muted ? 0.12 : 0.2 }}
            />
            <div className={cn('relative flex min-w-0 flex-1 items-center text-xs', renderLeading && 'gap-1.5')}>
              {renderLeading?.(row)}
              <span
                className={cn(
                  'block min-w-0 truncate',
                  row.muted && 'text-muted-foreground',
                  active && 'font-medium text-foreground',
                )}
                title={label}
              >
                {label}
              </span>
            </div>
            <span
              className="relative w-20 shrink-0 text-right text-xs font-medium tabular-nums"
              title={row.value.toLocaleString('en-US', { maximumFractionDigits: 6 })}
            >
              {compactNumber(row.value)}
            </span>
            {showShare && (
              <span className="relative w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {total > 0 ? `${((row.value / total) * 100).toFixed(1)}%` : '—'}
              </span>
            )}
          </>
        )

        const rowClass = cn(
          'relative flex w-full items-center gap-2 overflow-hidden border-b border-border/50 px-2 py-1.5 text-left transition-colors last:border-0',
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
              className={rowClass}
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
