import { CalendarDays } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fmtDate, TIME_RANGE_PRESETS } from '@/lib/date-presets'
import { cn } from '@/lib/utils'

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

export interface TimeRange {
  from: Date
  to: Date
}

export interface DatePreset {
  label: string
  resolve: () => TimeRange
}

export function DateRangePicker({
  value,
  onChange,
  allowUnset,
  presets = TIME_RANGE_PRESETS,
  unsetLabel = 'All time',
}: {
  value: TimeRange | undefined
  onChange: (range: TimeRange | undefined) => void
  allowUnset?: boolean
  presets?: DatePreset[]
  unsetLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<'from' | 'to'>('from')
  const fallback = presets[0].resolve()
  const [draftFrom, setDraftFrom] = useState(value?.from ?? fallback.from)
  const [draftTo, setDraftTo] = useState(value?.to ?? fallback.to)

  useEffect(() => {
    if (open) {
      setDraftFrom(value?.from ?? fallback.from)
      setDraftTo(value?.to ?? fallback.to)
      setEditing('from')
    }
    // Reset draft state only when the popover opens/closes, not when value or fallback change.
  }, [open])

  const applyAndClose = (from: Date, to: Date) => {
    onChange({ from, to: endOfDay(to) })
    setOpen(false)
  }

  const handleDayClick = (day: Date) => {
    if (editing === 'from') {
      setDraftFrom(day)
      setDraftTo(day)
      setEditing('to')
    } else {
      if (day < draftFrom) {
        setDraftFrom(day)
      } else {
        setDraftTo(day)
        applyAndClose(draftFrom, day)
      }
    }
  }

  const label = value ? `${fmtDate(value.from)} – ${fmtDate(value.to)}` : unsetLabel

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7 hover:bg-muted/40 transition-colors">
        <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-xs gap-1">
          <CalendarDays className="w-3 h-3" />
          time
        </span>
        <span className="px-2 h-full flex items-center">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50">
          <button
            type="button"
            onClick={() => setEditing('from')}
            className={cn(
              'text-xs px-2 py-1 rounded-md transition-colors',
              editing === 'from'
                ? 'bg-primary/10 text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {fmtDate(draftFrom)}
          </button>
          <span className="text-xs text-muted-foreground/50">–</span>
          <button
            type="button"
            onClick={() => setEditing('to')}
            className={cn(
              'text-xs px-2 py-1 rounded-md transition-colors',
              editing === 'to'
                ? 'bg-primary/10 text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {fmtDate(draftTo)}
          </button>
        </div>
        <div className="flex">
          <div className="border-r border-border/50 py-1.5 px-1 w-[260px] flex flex-col gap-0.5">
            {presets.map(preset => {
              const display = preset.resolve()
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChange(preset.resolve())
                    setOpen(false)
                  }}
                  className="flex items-baseline justify-between gap-3 px-2.5 py-1 text-xs text-left rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <span className="whitespace-nowrap">{preset.label}</span>
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground/50 tabular-nums">
                    {fmtDate(display.from)} – {fmtDate(display.to)}
                  </span>
                </button>
              )
            })}
            {allowUnset && (
              <button
                type="button"
                onClick={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
                className="px-2.5 py-1 text-xs text-left rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {unsetLabel}
              </button>
            )}
          </div>
          <Calendar
            mode="range"
            selected={{ from: draftFrom, to: draftTo }}
            onSelect={(_range, triggerDate) => handleDayClick(triggerDate)}
            disabled={{ after: new Date() }}
            numberOfMonths={2}
            className="font-[inherit]"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
