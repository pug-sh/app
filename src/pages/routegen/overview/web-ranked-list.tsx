import type { ReactNode } from 'react'
import { getIndexedColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RankedRow } from './web-breakdown'

// Ranked list for the web-analytics breakdown panels, in the "row is the bar" style: each row carries a
// left-anchored fill sized to its share of the top value, the label reading over it and the value +
// share pinned right. Takes resolved RankedRows, so top-K and session breakdowns render identically.
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
  // The caller's promise that the rows sum to a meaningful total: true for top-K (the $others bucket
  // captures the tail), false for session breakdowns (top-N sliced, so a share would mean % of shown).
  showShare?: boolean
  onRowClick?: (row: RankedRow) => void
  isActive?: (row: RankedRow) => boolean
  // Fixed-size slot before the label; return a same-size spacer for glyph-less rows so labels align.
  renderLeading?: (row: RankedRow) => ReactNode
  // Display-only override (e.g. country code → name) — the raw label stays the filter/query key.
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
        <div className="sticky top-0 z-20 mb-1 flex items-center gap-2 border-b border-border/50 bg-background px-2 pt-0.5 pb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
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
            {/* Selection rail. Sits above the bar so it stays visible on a full-width one — the row tint
                alone disappears behind the top row's bar, which is exactly where selection matters most. */}
            {active && <span className="absolute inset-y-0 left-0 z-10 w-[3px] bg-link" />}
            <span
              className="absolute inset-y-0 left-0 rounded-md"
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
              <span className="relative w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {total > 0 ? `${((row.value / total) * 100).toFixed(1)}%` : '—'}
              </span>
            )}
          </>
        )

        // Rows are separated by spacing, not rules, so each one reads as its own pill — which also lets
        // the selected row tint as a rounded block instead of a square band cutting across the list.
        // Hover is split by state: a shared hover would replace the selection tint with plain grey,
        // making a selected row look *less* selected while the pointer is on it.
        const rowClass = cn(
          'relative mb-0.5 flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left transition-colors last:mb-0',
          active && 'bg-primary/10 dark:bg-primary/20',
          canClick && 'cursor-pointer',
          canClick && !active && 'hover:bg-muted/40',
          canClick && active && 'hover:bg-primary/15 dark:hover:bg-primary/25',
          !canClick && 'cursor-default',
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
