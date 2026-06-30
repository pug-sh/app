import { Check, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { supportedTimezones } from '@/lib/timezone'
import { cn } from '@/lib/utils'

// `''` is the canonical UTC value (matches the server's zero); show it as "UTC".
const labelFor = (value: string) => value || 'UTC'

export const TimezonePicker = ({
  value,
  detected,
  onChange,
  invalid,
}: {
  value: string
  detected: string
  onChange: (value: string) => void
  invalid?: boolean
}) => {
  const [open, setOpen] = useState(false)
  const zones = useMemo(() => supportedTimezones(), [])

  // Rare engines without Intl.supportedValuesOf → free-text input (still Zod-validated).
  if (zones.length === 0) {
    return (
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="UTC"
        aria-invalid={invalid}
        className="font-mono"
      />
    )
  }

  const select = (next: string) => {
    setOpen(false)
    onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs',
          'hover:bg-muted/40 transition-colors',
          invalid && 'border-destructive',
        )}
        aria-invalid={invalid}
      >
        <span className="font-mono">{labelFor(value)}</span>
        <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command>
          <CommandInput placeholder="Search timezones..." className="text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-xs">No timezone found</CommandEmpty>
            <CommandGroup heading="Common">
              <CommandItem value="UTC" onSelect={() => select('')} className="text-xs py-1.5">
                <Check className={cn('w-3 h-3 shrink-0', value === '' ? 'opacity-100' : 'opacity-0')} />
                <span className="font-mono">UTC</span>
              </CommandItem>
              {detected && detected !== 'UTC' && (
                <CommandItem
                  value={`detected ${detected}`}
                  onSelect={() => select(detected)}
                  className="text-xs py-1.5"
                >
                  <Check className={cn('w-3 h-3 shrink-0', value === detected ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-mono">{detected}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/60 shrink-0">detected</span>
                </CommandItem>
              )}
            </CommandGroup>
            <CommandGroup heading="All timezones">
              {zones.map(zone => (
                <CommandItem key={zone} value={zone} onSelect={() => select(zone)} className="text-xs py-1.5">
                  <Check className={cn('w-3 h-3 shrink-0', value === zone ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-mono truncate">{zone}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
