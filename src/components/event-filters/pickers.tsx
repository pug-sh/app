import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Check, Plus, X } from 'lucide-react'
import { startTransition, useMemo, useState } from 'react'
import { getSeriesColor } from '@/lib/event-colors'

const getSchemaEmptyMessage = (schema: GetFilterSchemaResponse | null, schemaError: string | null): string => {
  if (schemaError) return 'Failed to load'
  if (schema) return 'No properties'
  return 'Loading...'
}

type PropertyPickerMode = { kind: 'pick' } | { kind: 'multi-select'; selected: ReadonlySet<string> }

export const PropertyPickerList = ({
  schema,
  schemaError,
  placeholder,
  mode,
  onSelect,
}: {
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  placeholder: string
  mode: PropertyPickerMode
  onSelect: (name: string, source: PropertySource) => void
}) => {
  const selected = mode.kind === 'multi-select' ? mode.selected : null
  const hasSystem = schema && schema.autoPropertyKeys.length > 0
  const hasCustom = schema && schema.customPropertyKeys.length > 0
  const hasProfile = schema && schema.profilePropertyKeys.length > 0

  return (
    <Command>
      <CommandInput placeholder={placeholder} className="text-xs" />
      <CommandList>
        <CommandEmpty className="py-4 text-xs">{getSchemaEmptyMessage(schema, schemaError)}</CommandEmpty>
        {hasSystem && (
          <CommandGroup heading="System">
            {schema.autoPropertyKeys.map(pk => (
              <CommandItem
                key={pk.name}
                value={pk.name}
                onSelect={() => onSelect(pk.name, PropertySource.AUTO)}
                className="text-xs py-1.5"
              >
                {selected && (
                  <Check className={cn('w-3 h-3 shrink-0', selected.has(pk.name) ? 'opacity-100' : 'opacity-0')} />
                )}
                <span className="font-mono text-muted-foreground truncate">{pk.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
                  {compactNumber(pk.count)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {hasCustom && (
          <CommandGroup heading="Custom">
            {schema.customPropertyKeys.map(pk => (
              <CommandItem
                key={pk.name}
                value={pk.name}
                onSelect={() => onSelect(pk.name, PropertySource.CUSTOM)}
                className="text-xs py-1.5"
              >
                {selected && (
                  <Check className={cn('w-3 h-3 shrink-0', selected.has(pk.name) ? 'opacity-100' : 'opacity-0')} />
                )}
                <span className="truncate">{pk.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
                  {compactNumber(pk.count)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {hasProfile && (
          <CommandGroup heading="Profile">
            {schema.profilePropertyKeys.map(pk => (
              <CommandItem
                key={pk.name}
                value={pk.name}
                onSelect={() => onSelect(pk.name, PropertySource.PROFILE)}
                className="text-xs py-1.5"
              >
                {selected && (
                  <Check className={cn('w-3 h-3 shrink-0', selected.has(pk.name) ? 'opacity-100' : 'opacity-0')} />
                )}
                {pk.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}

const EventPopoverList = ({
  events,
  value,
  loaded,
  schemaError,
  getEventColor,
  onSelect,
}: {
  events: EventNameMeta[]
  value: string
  loaded: boolean
  schemaError: string | null
  getEventColor?: (eventName: string) => string
  onSelect: (name: string) => void
}) => {
  const getEmptyMessage = () => {
    if (schemaError) return 'Failed to load events'
    if (!loaded) return 'Loading event names...'
    if (events.length === 0) return 'No event names'
    return 'No events found'
  }

  return (
    <Command>
      <CommandInput placeholder="Search events..." className="text-xs" />
      <CommandList>
        <CommandEmpty className="py-4 text-xs">{getEmptyMessage()}</CommandEmpty>
        <CommandGroup>
          {events.map(ev => {
            const colors = getSeriesColor(ev.name)
            const customColor = getEventColor?.(ev.name)
            return (
              <CommandItem
                key={ev.name}
                value={ev.name}
                onSelect={() => onSelect(ev.name)}
                data-checked={value === ev.name}
                className="text-xs gap-1.5 py-1.5"
              >
                <span
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ backgroundColor: customColor ?? colors.dot }}
                />
                <span className="flex-1 truncate">{ev.name}</span>
                <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
                  {compactNumber(ev.count)}
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

export const EventChip = ({
  value,
  onChange,
  events,
  eventsLoaded,
  schemaError,
  color,
  getEventColor,
}: {
  value: string
  onChange: (v: string) => void
  events: EventNameMeta[]
  eventsLoaded: boolean
  schemaError: string | null
  color?: string
  getEventColor?: (eventName: string) => string
}) => {
  const [open, setOpen] = useState(false)
  const colors = value ? getSeriesColor(value) : undefined

  if (!value) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'inline-flex items-center gap-1 border border-dashed border-border rounded-md px-2 h-7 text-xs cursor-pointer',
            'text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors',
            open && 'border-foreground/20 text-foreground'
          )}
        >
          <Plus className="w-3 h-3" />
          Event
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <EventPopoverList
            events={events}
            value={value}
            loaded={eventsLoaded}
            schemaError={schemaError}
            getEventColor={getEventColor}
            onSelect={name => {
              setOpen(false)
              startTransition(() => onChange(name))
            }}
          />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <span className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7">
      <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px]">event</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="px-2 h-full flex items-center gap-1.5 hover:bg-muted/40 transition-colors cursor-pointer">
          <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: color ?? colors?.dot }} />
          {value}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <EventPopoverList
            events={events}
            value={value}
            loaded={eventsLoaded}
            schemaError={schemaError}
            getEventColor={getEventColor}
            onSelect={name => {
              setOpen(false)
              startTransition(() => onChange(name))
            }}
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={() => onChange('')}
        className="px-1.5 h-full flex items-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

export const BreakdownChip = ({ property, onRemove }: { property: string; onRemove: () => void }) => (
  <span className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7">
    <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px]">break by</span>
    <span className="px-2 h-full flex items-center font-mono">{property}</span>
    <button
      type="button"
      onClick={onRemove}
      className="px-1.5 h-full flex items-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
    >
      <X className="w-3 h-3" />
    </button>
  </span>
)

export const BreakdownBuilder = ({
  schema,
  schemaError,
  breakdowns,
  onAdd,
  onRemove,
  disabled,
}: {
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  breakdowns: ReadonlyArray<string>
  onAdd: (prop: string) => void
  onRemove: (prop: string) => void
  disabled?: { reason: string }
}) => {
  const [open, setOpen] = useState(false)
  const existing = useMemo(() => new Set(breakdowns), [breakdowns])

  if (disabled) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 border border-dashed border-border rounded-md px-2 h-7 text-xs',
          'text-muted-foreground/50 cursor-not-allowed'
        )}
        title={disabled.reason}
      >
        <Plus className="w-3 h-3" />
        Breakdown
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1 border border-dashed border-border rounded-md px-2 h-7 text-xs cursor-pointer',
          'text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors',
          open && 'border-foreground/20 text-foreground'
        )}
      >
        <Plus className="w-3 h-3" />
        Breakdown
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <PropertyPickerList
          schema={schema}
          schemaError={schemaError}
          placeholder="Break down by..."
          mode={{ kind: 'multi-select', selected: existing }}
          onSelect={name => {
            if (existing.has(name)) {
              onRemove(name)
            } else {
              onAdd(name)
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
