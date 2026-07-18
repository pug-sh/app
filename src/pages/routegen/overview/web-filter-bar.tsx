import { X } from 'lucide-react'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { filterChips, filterPropertyLabel } from './web-filters'

// Active cross-filters, shown as removable chips (one per selected value, so a multi-value IN filter
// expands to several). Clicking a chip clears that value; "Clear all" resets the view. Renders
// nothing when unfiltered.
export const WebFilterBar = ({
  filters,
  onRemove,
  onClear,
}: {
  filters: readonly ActiveFilter[]
  onRemove: (property: string, value: string) => void
  onClear: () => void
}) => {
  if (filters.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Filters</span>
      {filterChips(filters).map(({ property, value }) => (
        <button
          key={`${property}:${value}`}
          type="button"
          onClick={() => onRemove(property, value)}
          className="group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 py-1 pr-2 pl-2.5 text-xs transition-colors hover:bg-muted"
          title="Remove filter"
        >
          <span className="text-muted-foreground">{filterPropertyLabel(property)}</span>
          <span className="max-w-[12rem] truncate font-medium">{value}</span>
          <X className="size-3 text-muted-foreground group-hover:text-foreground" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Clear all
      </button>
    </div>
  )
}
