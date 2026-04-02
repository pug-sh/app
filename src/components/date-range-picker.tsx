import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'
import { useEffect, useState } from 'react'

export interface TimeRange {
  from: Date
  to: Date
}

export interface DatePreset {
  label: string
  resolve: () => TimeRange
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

const lastNDays = (n: number): TimeRange => {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - n)
  return { from: startOfDay(from), to: now }
}

const lastNMonths = (n: number): TimeRange => {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - n, 1)
  return { from: startOfDay(from), to: now }
}

export const ACTIVITY_PRESETS: DatePreset[] = [
  { label: 'Today', resolve: () => ({ from: startOfDay(new Date()), to: new Date() }) },
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
      from.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
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
  { label: 'Last 6 months', resolve: () => lastNMonths(6) },
]

export const INSIGHTS_PRESETS: DatePreset[] = [
  { label: 'Last 7 days', resolve: () => lastNDays(7) },
  { label: 'Last 14 days', resolve: () => lastNDays(14) },
  { label: 'Last 30 days', resolve: () => lastNDays(30) },
  { label: 'Last 3 months', resolve: () => lastNMonths(3) },
  { label: 'Last 6 months', resolve: () => lastNMonths(6) },
  { label: 'Last 12 months', resolve: () => lastNMonths(12) },
]

export const fmtDate = (d: Date): string => {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })
}

export const defaultRange = (): TimeRange => ACTIVITY_PRESETS.find(p => p.label === 'This month')!.resolve()

export function DateRangePicker({
  value,
  onChange,
  allowUnset,
  presets = ACTIVITY_PRESETS,
}: {
  value: TimeRange | undefined
  onChange: (range: TimeRange | undefined) => void
  allowUnset?: boolean
  presets?: DatePreset[]
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<'from' | 'to'>('from')
  const fallback = presets[0].resolve()
  const [draftFrom, setDraftFrom] = useState<Date>(value?.from ?? fallback.from)
  const [draftTo, setDraftTo] = useState<Date>(value?.to ?? fallback.to)

  useEffect(() => {
    if (open) {
      setDraftFrom(value?.from ?? fallback.from)
      setDraftTo(value?.to ?? fallback.to)
      setEditing('from')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset draft state only when popover opens/closes, not when value or fallback change
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
          <div className='border-r border-border/50 py-1.5 px-1 w-[160px] flex flex-col gap-0.5'>
            {presets.map((preset) => {
              const display = preset.resolve()
              return (
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
                  <span className='block text-[10px] text-muted-foreground/50'>
                    {fmtDate(display.from)} – {fmtDate(display.to)}
                  </span>
                </button>
              )
            })}
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
