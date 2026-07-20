import type { JsonObject } from '@bufbuild/protobuf'
import { structToEntries } from '@/lib/struct'

const MAX_PROPERTIES = 5

// Vertical key/value panel listing up to MAX_PROPERTIES profile properties, used as
// the hover tooltip on a user. Pair with contentClassName={tooltipPanelContent} on
// the DetailTooltip so this panel owns its padding.
export const PropertiesTooltip = ({ properties }: { properties?: JsonObject }) => {
  const entries = structToEntries(properties)
  if (!entries.length) return null

  const shown = entries.slice(0, MAX_PROPERTIES)
  const extra = entries.length - shown.length

  return (
    <div className="min-w-[9rem] max-w-[18rem] px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Properties</div>
      <div className="-mx-3 my-2 h-px bg-border/60" />
      <div className="flex flex-col gap-1.5">
        {shown.map(([key, value]) => (
          <div key={key} className="flex items-baseline justify-between gap-4 text-xs">
            <span className="shrink-0 text-muted-foreground">{key}</span>
            <span className="min-w-0 truncate text-right font-medium text-foreground">{value}</span>
          </div>
        ))}
        {extra > 0 && <div className="text-xs text-muted-foreground">+{extra} more</div>}
      </div>
    </div>
  )
}
