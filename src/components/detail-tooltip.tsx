import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type DetailTooltipProps = {
  detail?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export const DetailTooltip = ({ detail, children, className, contentClassName }: DetailTooltipProps) => {
  const triggerClassName = cn('inline-flex min-w-0 max-w-full', className)

  if (!detail) {
    return <span className={triggerClassName}>{children}</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={triggerClassName} />}>{children}</TooltipTrigger>
      <TooltipContent side="top" align="start" className={contentClassName}>
        {detail}
      </TooltipContent>
    </Tooltip>
  )
}

// Container styling for the bespoke inline tooltips: zero the default tooltip
// padding (the inline row owns it), soften the corner, and use a diffuse shadow.
export const tooltipPanelContent = 'p-0 rounded-lg shadow-[0_10px_30px_-12px_rgba(24,24,27,0.25)]'

// Bespoke inline tooltip: a single horizontal spec line of icon+label groups.
// Pass the groups as `items`; hairline dividers are inserted between them.
export const TooltipInline = ({ items }: { items: ReactNode[] }) => (
  <div className="flex items-center gap-2.5 px-3 py-2 text-xs">
    {items.flatMap((item, i) =>
      i === 0 ? [item] : [<span key={`sep-${i}`} className="h-3.5 w-px shrink-0 bg-border" />, item],
    )}
  </div>
)

export const TooltipInlineItem = ({
  icon,
  label,
  version,
}: {
  icon?: ReactNode
  label: ReactNode
  version?: ReactNode
}) => (
  <span className="flex items-center gap-1.5 whitespace-nowrap">
    {icon ? <span className="inline-flex shrink-0 items-center">{icon}</span> : null}
    <span className="font-medium text-foreground">{label}</span>
    {version ? <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{version}</span> : null}
  </span>
)
