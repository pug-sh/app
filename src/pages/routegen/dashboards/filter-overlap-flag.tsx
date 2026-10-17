import { Funnel } from 'lucide-react'
import type { PropertyFilter } from '@/api/genproto/common/v1/filters_pb'
import { FILTER_OPERATORS, filterValueLabel } from '@/components/event-filters/filter-model'
import { fromProtoFilter } from '@/components/event-filters/filter-proto'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { dashboardFilterOverlap } from './dashboard-filters'

type Overlap = ReturnType<typeof dashboardFilterOverlap>

export const filteredEmptyQualifier = (overlap: Overlap, filtered: boolean) => {
  if (overlap.filters.length > 0) return "under both this tile's filters and the dashboard's"
  if (filtered) return 'under the dashboard filters'
  return undefined
}

const describeFilter = (filter: PropertyFilter) => {
  const active = fromProtoFilter(filter)
  const symbol = FILTER_OPERATORS.find(option => option.value === active.operator)?.symbol
  return [active.property, symbol, filterValueLabel(active)].filter(Boolean).join(' ')
}

export const FilterOverlapFlag = ({ overlap }: { overlap: Overlap }) => (
  <Tooltip>
    <TooltipTrigger
      aria-label="Overlaps the dashboard filters"
      className="mt-1 ml-auto inline-flex shrink-0 cursor-help text-muted-foreground transition-colors hover:text-foreground"
    >
      <Funnel className="size-3.5" />
    </TooltipTrigger>
    <TooltipContent side="bottom" align="end" className="flex-col items-start">
      {[...new Set(overlap.filters.map(describeFilter))].map(condition => (
        <p key={condition}>
          Has its own <span className="font-mono">{condition}</span> filter. Both apply.
        </p>
      ))}
      {overlap.splits.map(property => (
        <p key={property}>
          Split by <span className="font-mono">{property}</span>, which the dashboard filters.
        </p>
      ))}
    </TooltipContent>
  </Tooltip>
)
