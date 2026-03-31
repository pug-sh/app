import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import type { EventNameMeta, GetFilterSchemaResponse } from '@/api/genproto/dashboard/insights/v1/insights_pb'
import { PropertySource } from '@/api/genproto/dashboard/insights/v1/insights_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { activityRPCAtom, insightsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt'
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import HoverSwap from '@/components/hover-swap'
import { formatRelative } from '@/hooks/use-relative-time'
import ProjectLink from '@/components/project-link'
import { structGet, structToEntries } from '@/lib/struct'
import { cn } from '@/lib/utils'
import { useAtomValue, useSetAtom } from 'jotai'
import { Toggle } from '@/components/ui/toggle'
import { AlertCircle, Braces, Check, ChevronDown, ChevronRight, List, Loader2, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from './filter-schema.atoms'

// ── Helpers ─────────────────────────────────────────────────────────────────

const tsToDate = (ts: Timestamp | undefined): Date | null => {
  if (!ts) return null
  try {
    return timestampDate(ts)
  } catch (err) {
    console.warn('Invalid timestamp:', ts, err)
    return null
  }
}

const formatAbsolute = (d: Date): string => {
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })
  )
}

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
  click: 0,
  form_start: 1,
  form_submit: 2,
  rage_click: 4,
  dead_click: 6,
  page_view: 3,
  scroll: 5,
}

const hashString = (s: string): number => {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const kindStyle = (kind: string): { bg: string; dot: string; text: string } => {
  if (kind in FIXED_KIND_COLORS) {
    return COLOR_PALETTE[FIXED_KIND_COLORS[kind]]
  }
  return COLOR_PALETTE[hashString(kind) % COLOR_PALETTE.length]
}

// ── Filter Constants ─────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '14d', ms: 14 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
] as const

const OPERATORS: readonly { value: FilterOperator; label: string; symbol: string; noValue?: boolean; multiValue?: boolean }[] = [
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

interface ActiveFilter {
  property: string
  operator: FilterOperator
  value: string
  values: string[]
}

const compactNumber = (n: bigint): string => {
  const v = Number(n)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return v.toString()
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

const EventChip = ({
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

  // No event selected — show "+ Event" trigger
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

  // Event selected — show as segmented chip
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

// ── Suggestions hook ────────────────────────────────────────────────────────

const useSuggestions = (propertyKey: string, source: PropertySource) => {
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!propertyKey) return
    setLoaded(false)
    insightsRPC.getPropertyValues({ propertyKey, source }, { headers }).then(
      resp => { setSuggestions(resp.values); setLoaded(true) },
      () => setLoaded(true)
    )
  }, [propertyKey, source, insightsRPC, headers])

  return { suggestions, loaded }
}

// ── Filter Builder (single-popover stepped flow) ────────────────────────────

type BuilderStep = 'property' | 'operator' | 'value'

const FilterBuilder = ({
  schema,
  schemaError,
  onAdd,
}: {
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  onAdd: (filter: ActiveFilter) => void
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
  const { suggestions, loaded } = useSuggestions(
    step === 'value' ? prop : '',
    propSource
  )

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

        {/* Step 1: pick property */}
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

        {/* Step 2: pick operator */}
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

        {/* Step 3: pick value(s) */}
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

const FilterChip = ({
  filter,
  onRemove,
  onUpdate,
  schema,
}: {
  filter: ActiveFilter
  onRemove: () => void
  onUpdate: (f: ActiveFilter) => void
  schema: GetFilterSchemaResponse | null
}) => {
  const op = OPERATORS.find(o => o.value === filter.operator)
  const [editOpen, setEditOpen] = useState(false)

  const propSource = schema
    ? schema.autoPropertyKeys.some(pk => pk.name === filter.property) ? PropertySource.AUTO
      : schema.customPropertyKeys.some(pk => pk.name === filter.property) ? PropertySource.CUSTOM
        : PropertySource.PROFILE
    : PropertySource.UNSPECIFIED

  const { suggestions, loaded } = useSuggestions(editOpen ? filter.property : '', propSource)

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

// ── Event Row ───────────────────────────────────────────────────────────────

const EventRow = ({ event }: { event: ActivityEvent }) => {
  const [expanded, setExpanded] = useState(false)
  const [jsonMode, setJsonMode] = useState(false)
  const d = tsToDate(event.occurTime)
  const autoProps = structToEntries(event.autoProperties)
  const customProps = structToEntries(event.customProperties)
  const inlineProps = customProps.slice(0, 3)
  const hasMore = autoProps.length > 0 || customProps.length > 3
  const colors = kindStyle(event.kind)
  const platform = structGet(event.autoProperties, '$platform')
  const osVersion = structGet(event.autoProperties, '$os_version')
  const city = structGet(event.autoProperties, '$city')
  const country = structGet(event.autoProperties, '$country')

  return (
    <>
      <tr
        className={cn(
          'group border-b border-border/50 transition-colors',
          hasMore && 'cursor-pointer hover:bg-muted/40'
        )}
        onClick={() => hasMore && setExpanded(!expanded)}
      >
        <td className='py-2.5 pr-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap align-middle w-[120px]'>
          {d && <HoverSwap primary={formatRelative(d)} secondary={formatAbsolute(d)} />}
        </td>
        <td className='py-2.5 pr-2 align-middle'>
          <Badge variant='secondary' className={cn('text-[11px] font-medium px-2 py-0.5', colors.bg, colors.text)}>
            {event.kind}
          </Badge>
        </td>
        <td className='py-2.5 pr-2 text-xs text-muted-foreground whitespace-nowrap align-middle'>
          {(city || country) && [city, country].filter(Boolean).join(', ')}
        </td>
        <td className='py-2.5 pr-2 text-xs text-muted-foreground whitespace-nowrap align-middle'>
          {(platform || osVersion) && [platform, osVersion].filter(Boolean).join(' ')}
        </td>
        <td className='py-2.5 pr-2 align-middle'>
          {inlineProps.length > 0 && (
            <div className='flex items-center gap-2 overflow-hidden'>
              {inlineProps.map(([k, v]) => (
                <span key={k} className='text-[11px] text-muted-foreground whitespace-nowrap'>
                  {k}: <span className='font-mono'>{v}</span>
                </span>
              ))}
            </div>
          )}
        </td>
        <td className='py-2.5 pr-2 text-right whitespace-nowrap align-middle'>
          <ProjectLink
            href={`/activities/${encodeURIComponent(event.distinctId)}`}
            onClick={e => e.stopPropagation()}
            className='text-xs font-mono text-primary hover:underline underline-offset-4'
          >
            {event.distinctId}
          </ProjectLink>
          {event.sessionId && (
            <>
              <span className='text-muted-foreground/40'> / </span>
              <ProjectLink
                href={`/activities/${encodeURIComponent(event.distinctId)}/${encodeURIComponent(event.sessionId)}`}
                onClick={e => e.stopPropagation()}
                className='text-xs font-mono text-primary hover:underline underline-offset-4'
              >
                {event.sessionId.slice(0, 8)}
              </ProjectLink>
            </>
          )}
        </td>
        <td className='py-2.5 w-5 align-middle'>
          {hasMore &&
            (expanded ? (
              <ChevronDown className='w-3.5 h-3.5 text-muted-foreground' />
            ) : (
              <ChevronRight className='w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity' />
            ))}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td className='pb-3 pt-1 align-top w-[120px]' onClick={e => e.stopPropagation()}>
            <Toggle size='sm' pressed={jsonMode} onPressedChange={setJsonMode}>
              <Braces className='w-3.5 h-3.5' />
            </Toggle>
          </td>
          <td colSpan={6} className='pb-3 pt-0'>
            {jsonMode ? (
              <pre className='text-xs font-mono bg-muted/50 rounded-t-none rounded-b-md p-3 overflow-x-auto whitespace-pre-wrap break-all'>
                {JSON.stringify(
                  {
                    event_id: event.eventId,
                    kind: event.kind,
                    distinct_id: event.distinctId,
                    session_id: event.sessionId || undefined,
                    occur_time: d?.toISOString(),
                    auto_properties: event.autoProperties,
                    custom_properties: event.customProperties,
                  },
                  null,
                  2
                )}
              </pre>
            ) : (
              <div className='space-y-2'>
                {autoProps.length > 0 && (
                  <div>
                    <p className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1'>
                      System
                    </p>
                    <div className='flex flex-wrap gap-1'>
                      {autoProps.map(([k, v]) => (
                        <span
                          key={k}
                          className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'
                        >
                          <span className='text-muted-foreground'>{k}</span>
                          <span className='font-mono'>{v}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {customProps.length > 0 && (
                  <div>
                    <p className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1'>
                      Custom
                    </p>
                    <div className='flex flex-wrap gap-1'>
                      {customProps.map(([k, v]) => (
                        <span
                          key={k}
                          className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'
                        >
                          <span className='text-muted-foreground'>{k}</span>
                          <span className='font-mono'>{v}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className='text-[10px] text-muted-foreground/40 font-mono'>{event.eventId}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const EventExplorer = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const activityRPC = useAtomValue(activityRPCAtom)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)

  // Applied filter state (drives API calls)
  const [kindFilter, setKindFilter] = useState('')
  const [userInput, setUserInput] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [rangeIdx, setRangeIdx] = useState(2) // 14d
  const [propFilters, setPropFilters] = useState<ActiveFilter[]>([])

  // Data
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [nextToken, setNextToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch schema once when project is available
  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  const addFilter = (f: ActiveFilter) => setPropFilters(prev => [...prev, f])

  const updateFilter = (idx: number, f: ActiveFilter) => setPropFilters(prev => prev.map((x, i) => i === idx ? f : x))

  const removeFilter = (idx: number) => setPropFilters(prev => prev.filter((_, i) => i !== idx))

  const commitUserFilter = () => {
    setUserFilter(userInput.trim())
  }

  const fetchEvents = useCallback(
    async (pageToken = '') => {
      setLoading(true)
      setError(null)
      try {
        const now = new Date()
        const from = new Date(now.getTime() - TIME_RANGES[rangeIdx].ms)
        const resp = await activityRPC.getEventExplorer(
          {
            distinctId: userFilter || undefined,
            kind: kindFilter || undefined,
            timeRange: { from: timestampFromDate(from), to: timestampFromDate(now) },
            propertyFilters: propFilters.map(f => ({
              property: f.property,
              operator: f.operator,
              value: f.value,
              values: f.values,
            })),
            pageSize: 100,
            pageToken,
          },
          { headers }
        )
        if (pageToken) {
          setEvents(prev => [...prev, ...resp.events])
        } else {
          setEvents(resp.events)
        }
        setNextToken(resp.nextPageToken)
      } catch (err) {
        console.error('Event explorer failed:', err)
        setError(pageToken ? 'Failed to load more events' : 'Failed to load events')
      } finally {
        setLoading(false)
      }
    },
    [activityRPC, headers, kindFilter, userFilter, rangeIdx, propFilters]
  )

  useEffect(() => {
    if (project) fetchEvents()
  }, [project, fetchEvents])

  if (!project) {
    return (
      <Page title='Events'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <List className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select a project first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title='Events' description='Browse raw events across all users'>
      {/* Filter bar */}
      <div className='space-y-3 mb-5'>
        {/* Time range + count */}
        <div className='flex items-center gap-3'>
          <div className='inline-flex rounded-lg border border-border bg-muted/30 p-0.5'>
            {TIME_RANGES.map((range, i) => (
              <button
                key={range.label}
                type='button'
                onClick={() => setRangeIdx(i)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer',
                  i === rangeIdx
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
          {events.length > 0 && (
            <span className='ml-auto text-xs text-muted-foreground tabular-nums'>{events.length} events</span>
          )}
        </div>

        {/* Filters row */}
        <div className='flex items-center gap-2 flex-wrap'>
          <EventChip value={kindFilter} onChange={setKindFilter} events={schema?.events ?? []} schemaError={schemaError} />
          {userFilter ? (
            <span className='inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7'>
              <span className='px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px]'>user</span>
              <Popover>
                <PopoverTrigger className='px-2 h-full flex items-center font-mono hover:bg-muted/40 transition-colors cursor-pointer'>
                  {userFilter}
                </PopoverTrigger>
                <PopoverContent align='start' className='w-52 p-2'>
                  <input
                    defaultValue={userFilter}
                    placeholder='User ID'
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const v = (e.target as HTMLInputElement).value.trim()
                        if (v) { setUserFilter(v); setUserInput(v) }
                      }
                    }}
                    className='w-full h-7 px-2 text-xs font-mono rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring'
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              <button
                type='button'
                onClick={() => { setUserFilter(''); setUserInput('') }}
                className='px-1.5 h-full flex items-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer'
              >
                <X className='w-3 h-3' />
              </button>
            </span>
          ) : (
            <Input
              placeholder='User ID'
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitUserFilter()
              }}
              className='w-40 h-7 text-sm'
            />
          )}
          {propFilters.map((f, i) => (
            <FilterChip
              key={i}
              filter={f}
              schema={schema}
              onRemove={() => removeFilter(i)}
              onUpdate={next => updateFilter(i, next)}
            />
          ))}
          <FilterBuilder schema={schema} schemaError={schemaError} onAdd={addFilter} />
        </div>
      </div>

      {/* Results */}
      {loading && events.length === 0 ? (
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      ) : error && events.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-16'>
          <AlertCircle className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>{error}</p>
          <Button variant='outline' size='sm' className='mt-2' onClick={() => fetchEvents()}>
            Retry
          </Button>
        </div>
      ) : events.length > 0 ? (
        <>
          <table className='w-full'>
            <thead>
              <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
                <th className='py-2 pr-2 text-left font-medium'>Time</th>
                <th className='py-2 pr-2 text-left font-medium'>Event</th>
                <th className='py-2 pr-2 text-left font-medium'>Location</th>
                <th className='py-2 pr-2 text-left font-medium'>Platform</th>
                <th className='py-2 pr-2 text-left font-medium'>Properties</th>
                <th className='py-2 pr-2 text-right font-medium'>User / Session</th>
                <th className='w-5' />
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <EventRow key={event.eventId} event={event} />
              ))}
            </tbody>
          </table>

          {error && (
            <div className='mt-4 mb-2 flex items-center justify-center gap-2 text-xs text-muted-foreground'>
              <AlertCircle className='w-3.5 h-3.5' />
              <span>{error}</span>
              <Button variant='outline' size='sm' className='h-6 text-xs' onClick={() => fetchEvents(nextToken)}>
                Retry
              </Button>
            </div>
          )}

          {!error && nextToken && (
            <div className='mt-4 mb-8'>
              <Button
                variant='outline'
                size='sm'
                className='w-full'
                onClick={() => fetchEvents(nextToken)}
                disabled={loading}
              >
                {loading ? <Loader2 className='animate-spin' /> : 'Load more events'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className='flex flex-col items-center justify-center py-16'>
          <List className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>No events found</p>
          <p className='text-xs text-muted-foreground'>Try adjusting filters or check a different time range</p>
        </div>
      )}
    </Page>
  )
}

export default EventExplorer
