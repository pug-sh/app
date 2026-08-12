import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export const OptionChip = <T extends string | number>({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  stableWidth = false,
  isOptionDisabled,
}: {
  label: string
  icon?: LucideIcon
  options: readonly { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
  stableWidth?: boolean
  // Returns a disabled-reason (shown as a tooltip) for an option, or null when enabled.
  isOptionDisabled?: (value: T) => string | null
}) => {
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)
  const valueMinWidth = stableWidth
    ? `${Math.max(...options.map(option => option.label.length), current?.label.length ?? 0)}ch`
    : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7 hover:bg-muted/40 transition-colors">
        <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-xs gap-1">
          {Icon && <Icon className="w-3 h-3" />}
          {label}
        </span>
        <span className="px-2 h-full flex items-center" style={{ minWidth: valueMinWidth }}>
          {current?.label ?? String(value)}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(stableWidth ? 'w-(--anchor-width)' : 'w-auto', 'p-1')}>
        <div className="flex flex-col gap-0.5">
          {options.map(opt => {
            const rawReason = isOptionDisabled?.(opt.value)
            // Treat a blank/whitespace reason as "enabled" so a disabled option can never
            // render an empty tooltip.
            const disabledReason = rawReason?.trim() ? rawReason : null
            const disabled = disabledReason !== null
            let optionClassName = 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            if (opt.value === value) {
              optionClassName = 'bg-muted text-foreground font-medium'
            }
            if (disabled) {
              optionClassName = 'text-faint'
            }
            const button = (
              <button
                key={String(opt.value)}
                type="button"
                aria-disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'px-3 py-1.5 text-xs text-left rounded-md transition-colors',
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                  stableWidth && 'w-full whitespace-nowrap',
                  optionClassName,
                )}
              >
                {opt.label}
              </button>
            )
            if (!disabled) return button
            return (
              <Tooltip key={String(opt.value)}>
                <TooltipTrigger render={button} />
                <TooltipContent side="right" className="text-xs">
                  {disabledReason}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
