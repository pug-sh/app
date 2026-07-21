import { Check, Globe, ListFilter, Monitor, Search, Smartphone, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { CountryCount, DeviceBreakdown, KindCount } from '@/components/live-map/live-visitors'
import { formatCountryName, LIVE_WINDOW_OPTIONS } from '@/components/live-map/live-visitors'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getSeriesColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export type DeviceFilter = 'all' | 'desktop' | 'mobile'

type Props = {
  windowMs: number
  onWindowChange: (ms: number) => void
  search: string
  onSearchChange: (value: string) => void
  kinds: KindCount[]
  selectedKinds: ReadonlySet<string>
  onToggleKind: (kind: string) => void
  onClearKinds: () => void
  device: DeviceFilter
  onDeviceChange: (device: DeviceFilter) => void
  devices: DeviceBreakdown
  countries: CountryCount[]
  selectedCountry: string | null
  onCountryChange: (country: string | null) => void
  hasActiveFilters: boolean
  onClearAll: () => void
}

const triggerClass = 'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors'

const KindFilter = ({
  kinds,
  selected,
  onToggle,
  onClear,
}: {
  kinds: KindCount[]
  selected: ReadonlySet<string>
  onToggle: (kind: string) => void
  onClear: () => void
}) => {
  const [open, setOpen] = useState(false)
  const label = selected.size === 0 ? 'All events' : `${selected.size} event${selected.size === 1 ? '' : 's'}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          triggerClass,
          selected.size > 0
            ? 'border-primary/40 bg-primary/5 text-foreground'
            : 'border-dashed border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
        )}
      >
        <ListFilter className="size-3" />
        {label}
        {selected.size > 0 && (
          <span
            role="button"
            tabIndex={-1}
            onClick={e => {
              e.stopPropagation()
              onClear()
            }}
            className="text-faint hover:text-foreground"
          >
            <X className="size-3" />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          <CommandInput placeholder="Search events..." className="text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-xs">No events in this window</CommandEmpty>
            <CommandGroup>
              {kinds.map(k => {
                const color = getSeriesColor(k.name).dot
                const isSelected = selected.has(k.name)
                return (
                  <CommandItem
                    key={k.name}
                    value={k.name}
                    onSelect={() => onToggle(k.name)}
                    className="gap-1.5 py-1.5 text-xs"
                  >
                    <Check className={cn('size-3 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                    <span className="size-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="flex-1 truncate">{k.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-faint">{compactNumber(k.count)}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const CountryFilter = ({
  countries,
  selected,
  onChange,
}: {
  countries: CountryCount[]
  selected: string | null
  onChange: (country: string | null) => void
}) => {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          triggerClass,
          selected
            ? 'border-primary/40 bg-primary/5 text-foreground'
            : 'border-dashed border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
        )}
      >
        <Globe className="size-3" />
        {selected ? formatCountryName(selected) : 'All countries'}
        {selected && (
          <span
            role="button"
            tabIndex={-1}
            onClick={e => {
              e.stopPropagation()
              onChange(null)
            }}
            className="text-faint hover:text-foreground"
          >
            <X className="size-3" />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Search countries..." className="text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-xs">No countries</CommandEmpty>
            <CommandGroup>
              {countries.map(c => (
                <CommandItem
                  key={c.country}
                  value={formatCountryName(c.country)}
                  onSelect={() => {
                    onChange(selected === c.country ? null : c.country)
                    setOpen(false)
                  }}
                  className="gap-1.5 py-1.5 text-xs"
                >
                  <Check className={cn('size-3 shrink-0', selected === c.country ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 truncate">{formatCountryName(c.country)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-faint">{c.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const DeviceToggle = ({
  device,
  onChange,
  devices,
}: {
  device: DeviceFilter
  onChange: (device: DeviceFilter) => void
  devices: DeviceBreakdown
}) => {
  const segment = (value: DeviceFilter, content: ReactNode) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        'inline-flex h-full items-center gap-1 px-2 transition-colors',
        device === value ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {content}
    </button>
  )

  return (
    <span className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border text-xs">
      {segment('all', 'All')}
      <span className="h-full w-px bg-border" />
      {segment(
        'desktop',
        <>
          <Monitor className="size-3" />
          {devices.desktop}
        </>,
      )}
      <span className="h-full w-px bg-border" />
      {segment(
        'mobile',
        <>
          <Smartphone className="size-3" />
          {devices.mobile}
        </>,
      )}
    </span>
  )
}

const WindowToggle = ({ windowMs, onChange }: { windowMs: number; onChange: (ms: number) => void }) => (
  <span className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border text-xs">
    {LIVE_WINDOW_OPTIONS.map((opt, i) => (
      <span key={opt.ms} className="inline-flex h-full items-center">
        {i > 0 && <span className="h-full w-px bg-border" />}
        <button
          type="button"
          onClick={() => onChange(opt.ms)}
          className={cn(
            'inline-flex h-full items-center px-2 tabular-nums transition-colors',
            windowMs === opt.ms ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      </span>
    ))}
  </span>
)

const LiveFilterBar = ({
  windowMs,
  onWindowChange,
  search,
  onSearchChange,
  kinds,
  selectedKinds,
  onToggleKind,
  onClearKinds,
  device,
  onDeviceChange,
  devices,
  countries,
  selectedCountry,
  onCountryChange,
  hasActiveFilters,
  onClearAll,
}: Props) => (
  <div className="flex flex-col gap-2 border-y border-border/30 bg-muted/20 px-3 py-2">
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2 size-3 text-faint" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search event, page, location..."
          className="h-7 w-full rounded-md border border-border bg-background/60 pr-2 pl-7 text-xs placeholder:text-faint focus:border-foreground/20 focus:outline-none"
        />
      </div>
      <WindowToggle windowMs={windowMs} onChange={onWindowChange} />
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      <KindFilter kinds={kinds} selected={selectedKinds} onToggle={onToggleKind} onClear={onClearKinds} />
      <DeviceToggle device={device} onChange={onDeviceChange} devices={devices} />
      <CountryFilter countries={countries} selected={selectedCountry} onChange={onCountryChange} />
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex h-7 items-center gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" /> Clear
        </button>
      )}
    </div>
  </div>
)

export default LiveFilterBar
