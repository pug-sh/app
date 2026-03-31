import type { EventNameMeta, GetFilterSchemaResponse } from '@/api/genproto/dashboard/insights/v1/insights_pb'
import { PropertySource } from '@/api/genproto/dashboard/insights/v1/insights_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { cn } from '@/lib/utils'
import { useAtomValue } from 'jotai'
import { Check, ChevronRight, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ActiveFilter {
  property: string
  operator: FilterOperator
  value: string
  values: string[]
}

export const OPERATORS: readonly {
  value: FilterOperator
  label: string
  symbol: string
  noValue?: boolean
  multiValue?: boolean
}[] = [
  { value: FilterOperator.EQUALS, label: 'equals', symbol: '=' },
  { value: FilterOperator.NOT_EQUALS, label: 'not equals', symbol: '≠' },
  { value: FilterOperator.CONTAINS, label: 'contains', symbol: '⊃', multiValue: true },
  { value: FilterOperator.NOT_CONTAINS, label: 'not contains', symbol: '⊅', multiValue: true },
  { value: FilterOperator.IN, label: 'in', symbol: '∈', multiValue: true },
  { value: FilterOperator.NOT_IN, label: 'not in', symbol: '∉', multiValue: true },
  { value: FilterOperator.IS_SET, label: 'is set', symbol: 'is set', noValue: true },
  { value: FilterOperator.IS_NOT_SET, label: 'is not set', symbol: 'is not set', noValue: true },
  { value: FilterOperator.GT, label: 'greater than', symbol: '>' },
  { value: FilterOperator.GTE, label: 'greater or equal', symbol: '≥' },
  { value: FilterOperator.LT, label: 'less than', symbol: '<' },
  { value: FilterOperator.LTE, label: 'less or equal', symbol: '≤' },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  { bg: 'bg-blue-500/10', dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400' },
  { bg: 'bg-emerald-500/10', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  { bg: 'bg-violet-500/10', dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-400' },
  { bg: 'bg-amber-500/10', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  { bg: 'bg-rose-500/10', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400' },
  { bg: 'bg-cyan-500/10', dot: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-400' },
  { bg: 'bg-pink-500/10', dot: 'bg-pink-500', text: 'text-pink-700 dark:text-pink-400' },
  { bg: 'bg-teal-500/10', dot: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-400' },
]

const FIXED_KIND_COLORS: Record<string, number> = {
  click: 0, form_start: 1, form_submit: 2, rage_click: 4,
  dead_click: 6, page_view: 3, scroll: 5,
}

const hashString = (s: string): number => {
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  return Math.abs(hash)
}

export const kindStyle = (kind: string): { bg: string; dot: string; text: string } => {
  if (kind in FIXED_KIND_COLORS) return COLOR_PALETTE[FIXED_KIND_COLORS[kind]]
  return COLOR_PALETTE[hashString(kind) % COLOR_PALETTE.length]
}

export const compactNumber = (n: bigint): string => {
  const v = Number(n)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return v.toString()
}

// ── Suggestions hook ────────────────────────────────────────────────────────

const useSuggestions = (propertyKey: string, source: PropertySource, eventKind?: string) => {
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loaded, setLoaded] = useState(true)

  useEffect(() => {
    if (!propertyKey) return

    let cancelled = false
    const setLoading = (v: boolean) => { if (!cancelled) setLoaded(v) }
    setLoading(false)
    insightsRPC.getPropertyValues({ propertyKey, source, eventKind: eventKind ?? '' }, { headers }).then(
      resp => { if (!cancelled) { setSuggestions(resp.values); setLoading(true) } },
      () => { setLoading(true) }
    )
    return () => { cancelled = true }
  }, [propertyKey, source, eventKind, insightsRPC, headers])

  return { suggestions, loaded }
}

// ── Event Picker ────────────────────────────────────────────────────────────

const eventPopoverList = (
  events: EventNameMeta[],
  value: string,
  schemaError: string | null,
  onSelect: (name: string) => void,
) => {
  const emptyMessage = schemaError
    ? 'Failed to load events'
    : events.length === 0
      ? 'Loading event names...'
      : 'No events found'

  return (
    <Command>
      <CommandInput placeholder='Search events...' className='text-xs' />
      <CommandList>
        <CommandEmpty className='py-4 text-xs'>{emptyMessage}</CommandEmpty>
        <CommandGroup>
          {[...events].sort((a, b) => Number(b.count - a.count)).map(ev => {
            const colors = kindStyle(ev.name)
            return (
              <CommandItem
                key={ev.name}
                value={ev.name}
                onSelect={() => onSelect(ev.name)}
                data-checked={value === ev.name}
                className='text-xs gap-1.5 py-1.5'
              >
                <span className={cn('w-1 h-1 rounded-full shrink-0', colors.dot)} />
                <span className='flex-1 truncate'>{ev.name}</span>
                <span className='text-[10px] text-muted-foreground/50 tabular-nums shrink-0'>
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
  schemaError,
}: {
  value: string
  onChange: (v: string) => void
  events: EventNameMeta[]
  schemaError: string | null
}) => {
  const [open, setOpen] = useState(false)
  const colors = value ? kindStyle(value) : null

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
          <Plus className='w-3 h-3' />
          Event
        </PopoverTrigger>
        <PopoverContent align='start' className='w-64 p-0'>
          {eventPopoverList(events, value, schemaError, name => { onChange(name); setOpen(false) })}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <span className='inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7'>
      <span className='px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px]'>event</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className='px-2 h-full flex items-center gap-1.5 hover:bg-muted/40 transition-colors cursor-pointer'>
          <span className={cn('w-1 h-1 rounded-full shrink-0', colors!.dot)} />
          {value}
        </PopoverTrigger>
        <PopoverContent align='start' className='w-64 p-0'>
          {eventPopoverList(events, value, schemaError, name => { onChange(name); setOpen(false) })}
        </PopoverContent>
      </Popover>
      <button
        type='button'
        onClick={() => onChange('')}
        className='px-1.5 h-full flex items-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer'
      >
        <X className='w-3 h-3' />
      </button>
    </span>
  )
}

// ── Filter Builder (single-popover stepped flow) ────────────────────────────

type BuilderStep = 'property' | 'operator' | 'value'

export const FilterBuilder = ({
  schema,
  schemaError,
  onAdd,
  kindFilter,
}: {
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  onAdd: (filter: ActiveFilter) => void
  kindFilter?: string
}) => {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<BuilderStep>('property')
  const [prop, setProp] = useState('')
  const [propSource, setPropSource] = useState<PropertySource>(PropertySource.UNSPECIFIED)
  const [op, setOp] = useState<FilterOperator>(FilterOperator.EQUALS)
  const [val, setVal] = useState('')
  const [vals, setVals] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const opMeta = OPERATORS.find(o => o.value === op)
  const { suggestions, loaded } = useSuggestions(step === 'value' ? prop : '', propSource, kindFilter)

  const reset = () => {
    setStep('property')
    setProp('')
    setPropSource(PropertySource.UNSPECIFIED)
    setOp(FilterOperator.EQUALS)
    setVal('')
    setVals([])
  }

  const pickProperty = (key: string, source: PropertySource) => {
    setProp(key)
    setPropSource(source)
    setStep('operator')
  }

  const pickOperator = (operator: FilterOperator) => {
    setOp(operator)
    const meta = OPERATORS.find(o => o.value === operator)
    if (meta?.noValue) {
      onAdd({ property: prop, operator, value: '', values: [] })
      setOpen(false)
      reset()
    } else {
      setVal('')
      setVals([])
      setStep('value')
    }
  }

  const commitFilter = () => {
    if (opMeta?.multiValue) {
      if (vals.length === 0) return
      onAdd({ property: prop, operator: op, value: '', values: vals })
    } else {
      if (!val.trim()) return
      onAdd({ property: prop, operator: op, value: val.trim(), values: [] })
    }
    setOpen(false)
    reset()
  }

  const toggleVal = (v: string) => {
    setVals(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const hasSystem = schema && schema.autoPropertyKeys.length > 0
  const hasCustom = schema && schema.customPropertyKeys.length > 0
  const hasProfile = schema && schema.profilePropertyKeys.length > 0

  const breadcrumb = (
    <div className='flex items-center gap-1 px-3 pt-2 pb-1 text-[10px] text-muted-foreground'>
      {step !== 'property' && (
        <>
          <button type='button' onClick={() => { setStep('property'); setProp(''); setOp(FilterOperator.EQUALS) }} className='hover:text-foreground cursor-pointer'>
            Property
          </button>
          <ChevronRight className='w-2.5 h-2.5' />
          <span className='font-mono text-foreground'>{prop}</span>
        </>
      )}
      {step === 'value' && (
        <>
          <ChevronRight className='w-2.5 h-2.5' />
          <button type='button' onClick={() => setStep('operator')} className='hover:text-foreground cursor-pointer'>
            {opMeta?.label}
          </button>
        </>
      )}
    </div>
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1 border border-dashed border-border rounded-md px-2 h-7 text-xs cursor-pointer',
          'text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors',
          open && 'border-foreground/20 text-foreground'
        )}
      >
        <Plus className='w-3 h-3' />
        Filter
      </PopoverTrigger>
      <PopoverContent align='start' className='w-64 p-0'>
        {step !== 'property' && breadcrumb}

        {step === 'property' && (
          <Command>
            <CommandInput placeholder='Filter by property...' className='text-xs' />
            <CommandList>
              <CommandEmpty className='py-4 text-xs'>
                {schemaError ? 'Failed to load' : schema ? 'No properties' : 'Loading...'}
              </CommandEmpty>
              {hasSystem && (
                <CommandGroup heading='System'>
                  {[...schema.autoPropertyKeys].sort((a, b) => Number(b.count - a.count)).map(pk => (
                    <CommandItem key={pk.name} value={pk.name} onSelect={() => pickProperty(pk.name, PropertySource.AUTO)} className='text-xs py-1.5'>
                      <span className='font-mono text-muted-foreground truncate'>{pk.name}</span>
                      <span className='ml-auto text-[10px] text-muted-foreground/50 tabular-nums shrink-0'>{compactNumber(pk.count)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {hasCustom && (
                <CommandGroup heading='Custom'>
                  {[...schema.customPropertyKeys].sort((a, b) => Number(b.count - a.count)).map(pk => (
                    <CommandItem key={pk.name} value={pk.name} onSelect={() => pickProperty(pk.name, PropertySource.CUSTOM)} className='text-xs py-1.5'>
                      <span className='truncate'>{pk.name}</span>
                      <span className='ml-auto text-[10px] text-muted-foreground/50 tabular-nums shrink-0'>{compactNumber(pk.count)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {hasProfile && (
                <CommandGroup heading='Profile'>
                  {schema.profilePropertyKeys.map(key => (
                    <CommandItem key={key} value={key} onSelect={() => pickProperty(key, PropertySource.PROFILE)} className='text-xs py-1.5'>
                      {key}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        )}

        {step === 'operator' && (
          <Command>
            <CommandList>
              <CommandGroup>
                {OPERATORS.map(o => (
                  <CommandItem key={o.value} value={o.label} onSelect={() => pickOperator(o.value)} className='text-xs py-1.5 gap-2'>
                    <span className='w-5 text-center text-muted-foreground font-mono text-[10px]'>{o.symbol}</span>
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        {step === 'value' && opMeta?.multiValue && (
          <div>
            {vals.length > 0 && (
              <div className='flex flex-wrap gap-1 px-3 pt-2'>
                {vals.map(v => (
                  <span key={v} className='inline-flex items-center gap-1 text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded'>
                    {v}
                    <button type='button' onClick={() => setVals(prev => prev.filter(x => x !== v))} className='text-muted-foreground hover:text-foreground'>
                      <X className='w-2.5 h-2.5' />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Command>
              <CommandInput placeholder='Search values...' className='text-xs' />
              <CommandList>
                <CommandEmpty className='py-3 text-xs'>{loaded ? 'No values' : 'Loading...'}</CommandEmpty>
                <CommandGroup>
                  {suggestions.map(s => (
                    <CommandItem key={s} value={s} onSelect={() => toggleVal(s)} className='text-xs py-1.5 font-mono gap-1.5'>
                      <Check className={cn('w-3 h-3 shrink-0', vals.includes(s) ? 'opacity-100' : 'opacity-0')} />
                      {s}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            <div className='border-t border-border px-3 py-2 flex justify-end'>
              <Button size='sm' className='h-6 text-xs px-3' onClick={commitFilter} disabled={vals.length === 0}>
                Apply
              </Button>
            </div>
          </div>
        )}

        {step === 'value' && !opMeta?.multiValue && (
          <div>
            {loaded && suggestions.length > 0 ? (
              <Command>
                <CommandInput placeholder='Search values...' className='text-xs' />
                <CommandList>
                  <CommandEmpty className='py-3 text-xs'>No match</CommandEmpty>
                  <CommandGroup>
                    {suggestions.map(s => (
                      <CommandItem
                        key={s}
                        value={s}
                        onSelect={() => { setVal(s); onAdd({ property: prop, operator: op, value: s, values: [] }); setOpen(false); reset() }}
                        className='text-xs py-1.5 font-mono'
                      >
                        {s}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            ) : (
              <div className='p-2'>
                <input
                  ref={inputRef}
                  placeholder='Type a value...'
                  value={val}
                  onChange={e => setVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitFilter() }}
                  className='w-full h-7 px-2 text-xs rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring'
                  autoFocus
                />
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Filter Chip (segmented, editable) ───────────────────────────────────────

export const FilterChip = ({
  filter,
  onRemove,
  onUpdate,
  schema,
  kindFilter,
}: {
  filter: ActiveFilter
  onRemove: () => void
  onUpdate: (f: ActiveFilter) => void
  schema: GetFilterSchemaResponse | null
  kindFilter?: string
}) => {
  const op = OPERATORS.find(o => o.value === filter.operator)
  const [editOpen, setEditOpen] = useState(false)

  const propSource = schema
    ? schema.autoPropertyKeys.some(pk => pk.name === filter.property) ? PropertySource.AUTO
      : schema.customPropertyKeys.some(pk => pk.name === filter.property) ? PropertySource.CUSTOM
        : PropertySource.PROFILE
    : PropertySource.UNSPECIFIED

  const { suggestions, loaded } = useSuggestions(editOpen ? filter.property : '', propSource, kindFilter)

  const valueLabel = op?.noValue
    ? null
    : op?.multiValue
      ? filter.values.join(', ')
      : filter.value

  return (
    <span className='inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7'>
      <span className='px-2 text-muted-foreground bg-muted/50 h-full flex items-center font-mono text-[11px]'>
        {filter.property}
      </span>
      <span className='px-1.5 text-muted-foreground/70 h-full flex items-center text-[10px]'>
        {op?.symbol}
      </span>
      {valueLabel !== null && (
        <Popover open={editOpen} onOpenChange={setEditOpen}>
          <PopoverTrigger className='px-2 h-full flex items-center font-mono hover:bg-muted/40 transition-colors cursor-pointer'>
            {valueLabel || '...'}
          </PopoverTrigger>
          <PopoverContent align='start' className='w-52 p-0'>
            {op?.multiValue ? (
              <Command>
                <CommandInput placeholder='Search...' className='text-xs' />
                <CommandList>
                  <CommandEmpty className='py-3 text-xs'>{loaded ? 'No values' : 'Loading...'}</CommandEmpty>
                  <CommandGroup>
                    {suggestions.map(s => {
                      const isSelected = filter.values.includes(s)
                      return (
                        <CommandItem
                          key={s}
                          value={s}
                          onSelect={() => {
                            const next = isSelected ? filter.values.filter(x => x !== s) : [...filter.values, s]
                            onUpdate({ ...filter, values: next })
                          }}
                          className='text-xs py-1.5 font-mono gap-1.5'
                        >
                          <Check className={cn('w-3 h-3 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                          {s}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            ) : loaded && suggestions.length > 0 ? (
              <Command>
                <CommandInput placeholder='Search...' className='text-xs' />
                <CommandList>
                  <CommandEmpty className='py-3 text-xs'>No match</CommandEmpty>
                  <CommandGroup>
                    {suggestions.map(s => (
                      <CommandItem
                        key={s}
                        value={s}
                        onSelect={() => { onUpdate({ ...filter, value: s }); setEditOpen(false) }}
                        className='text-xs py-1.5 font-mono'
                      >
                        {s}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            ) : (
              <div className='p-2'>
                <input
                  defaultValue={filter.value}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      onUpdate({ ...filter, value: (e.target as HTMLInputElement).value.trim() })
                      setEditOpen(false)
                    }
                  }}
                  className='w-full h-7 px-2 text-xs rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring font-mono'
                  autoFocus
                />
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
      <button
        type='button'
        onClick={onRemove}
        className='px-1.5 h-full flex items-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer'
      >
        <X className='w-3 h-3' />
      </button>
    </span>
  )
}
