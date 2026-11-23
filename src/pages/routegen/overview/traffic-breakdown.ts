import type { TopKRow, TrendSeries } from '@/api/genproto/shared/insights/v1/insights_pb'
import { breakdownLabel, collapseValues, isOthersBreakdown, OTHERS_LABEL } from '../insights/helpers'

// One row of a traffic breakdown list, already resolved to a display label and a single value.
// Produced from either a top-K result (event-grain) or a collapsed session breakdown (Entry/Exit),
// so the list renderer never has to know which query fed it.
export type RankedRow = {
  key: string
  label: string
  value: number
  // Rendered de-emphasized: the synthetic $others bucket and the empty-value bucket, which are
  // markers rather than literal dimension values.
  muted: boolean
}

// Top-K rows arrive metric-descending with the synthetic $others bucket (flagged by isOthers, not by
// label) last. Traffic breakdowns only use the PROPERTY and EVENT_KIND dimensions, so there is no profile
// row to resolve: dimensionValue is the label. Rows don't name their property, so the caller labels the empty one.
export const topKToRankedRows = (rows: readonly TopKRow[], emptyLabel: string) =>
  rows.map((row, index) => {
    if (row.isOthers) return { key: '$__others', label: OTHERS_LABEL, value: row.value, muted: true }
    if (!row.dimensionValue) return { key: `empty-${index}`, label: emptyLabel, value: row.value, muted: true }
    return { key: `${index}-${row.dimensionValue}`, label: row.dimensionValue, value: row.value, muted: false }
  })

// Collapse a session ENTRY/EXIT breakdown result into ranked rows. The query is TRENDS with one
// breakdown, so it returns one series per entry/exit value; each series' per-bucket session counts
// SUM to that value's total (sessions are keyed by start and land in exactly one bucket, so summing
// never double-counts). Sorted descending and capped at `limit`.
export const rankSessionBreakdown = (series: readonly TrendSeries[], limit: number) =>
  series
    .map((entry, index) => {
      const label = breakdownLabel(entry.breakdown, '')
      return {
        key: `${index}-${label}`,
        label,
        value: collapseValues(
          entry.points.map(point => point.value),
          'sum',
        ),
        muted: Object.values(entry.breakdown).every(value => !value) || isOthersBreakdown(entry.breakdown),
      }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
