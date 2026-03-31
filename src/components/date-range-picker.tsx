import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'
import { useEffect, useState } from 'react'

export interface TimeRange {
  from: Date
  to: Date
}

type PresetFn = () => TimeRange

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

const PRESETS: { label: string; resolve: PresetFn }[] = [
  {
    label: 'Today',
    resolve: () => ({ from: startOfDay(new Date()), to: new Date() }),
  },
  {
    label: 'Yesterday',
    resolve: () => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return { from: startOfDay(d), to: endOfDay(d) }
    },
  },
  {
    label: 'This week',
    resolve: () => {
      const now = new Date()
      const day = now.getDay()
      const from = new Date(now)
      from.setDate(now.getDate() - (day === 0 ? 6 : day - 1)) // Monday
      return { from: startOfDay(from), to: now }
    },
  },
  {
    label: 'Last week',
    resolve: () => {
      const now = new Date()
      const day = now.getDay()
      const thisMonday = new Date(now)
      thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      const lastMonday = new Date(thisMonday)
      lastMonday.setDate(thisMonday.getDate() - 7)
      const lastSunday = new Date(thisMonday)
      lastSunday.setDate(thisMonday.getDate() - 1)
      return { from: startOfDay(lastMonday), to: endOfDay(lastSunday) }
    },
  },
  {
    label: 'This month',
    resolve: () => {
      const now = new Date()
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
    },
  },
  {
    label: 'Last 6 months',
    resolve: () => {
      const now = new Date()
      const from = new Date(now)
      from.setMonth(from.getMonth() - 6)
      return { from: startOfDay(from), to: now }
    },
  },
]

const fmtDate = (d: Date): string => {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })
}

const defaultRange = (): TimeRange => PRESETS[4].resolve() // This month

export function DateRangePicker({
  value,
  onChange,
  allowUnset,
}: {
  value: TimeRange | undefined
  onChange: (range: TimeRange | undefined) => void
  allowUnset?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<'from' | 'to'>('from')
  const fallback = defaultRange()
  const [draftFrom, setDraftFrom] = useState<Date>(value?.from ?? fallback.from)
  const [draftTo, setDraftTo] = useState<Date>(value?.to ?? fallback.to)

  useEffect(() => {
    if (open) {
      setDraftFrom(value?.from ?? fallback.from)
      setDraftTo(value?.to ?? fallback.to)
      setEditing('from')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const label = value ? `${fmtDate(value.from)} – ${fmtDate(value.to)}` : 'All time'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className='inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7 cursor-pointer hover:bg-muted/40 transition-colors'
      >
        <span className='px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px] gap-1'>
          <CalendarDays className='w-3 h-3' />
          time
        </span>
        <span className='px-2 h-full flex items-center'>{label}</span>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-0'>
        <div className='flex items-center gap-1 px-3 py-2 border-b border-border/50'>
          <button
            type='button'
            onClick={() => setEditing('from')}
            className={cn(
              'text-xs px-2 py-1 rounded-md transition-colors cursor-pointer',
              editing === 'from'
                ? 'bg-primary/10 text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {fmtDate(draftFrom)}
          </button>
          <span className='text-xs text-muted-foreground/50'>–</span>
          <button
            type='button'
            onClick={() => setEditing('to')}
            className={cn(
              'text-xs px-2 py-1 rounded-md transition-colors cursor-pointer',
              editing === 'to'
                ? 'bg-primary/10 text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {fmtDate(draftTo)}
          </button>
        </div>
        <div className='flex'>
          <div className='border-r border-border/50 py-1.5 px-1 w-[120px] flex flex-col gap-0.5'>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type='button'
                onClick={() => {
                  onChange(preset.resolve())
                  setOpen(false)
                }}
                className='px-2.5 py-1 text-[11px] text-left rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer'
              >
                {preset.label}
              </button>
            ))}
            {allowUnset && (
              <button
                type='button'
                onClick={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
                className='px-2.5 py-1 text-[11px] text-left rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer'
              >
                All time
              </button>
            )}
          </div>
          <Calendar
            mode='range'
            selected={{ from: draftFrom, to: draftTo }}
            onSelect={(_range, triggerDate) => handleDayClick(triggerDate)}
            disabled={{ after: new Date() }}
            numberOfMonths={2}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { defaultRange }
