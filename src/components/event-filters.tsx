import type { GetFilterSchemaResponse } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAtomValue } from 'jotai'
import { Check, ChevronRight, Plus, X } from 'lucide-react'
import { getSeriesColor } from '@/lib/event-colors'
import { useEffect, useState } from 'react'
import type { EventFilterEntry, EventFiltersHandle } from '@/hooks/use-event-filters'
import { fetchSchemaForKind } from '@/hooks/use-global-filter-schema'

// ── Types ───────────────────────────────────────────────────────────────────

export type ActiveFilter =
  | { property: string; operator: FilterOperator; kind: 'single'; value: string }
  | { property: string; operator: FilterOperator; kind: 'multi'; values: string[] }
  | { property: string; operator: FilterOperator; kind: 'presence' }

const OPERATORS: readonly {
  value: FilterOperator
  label: string
  symbol?: string
  noValue?: boolean
  multiValue?: boolean
}[] = [
  { value: FilterOperator.EQUALS, label: 'equals', symbol: '=' },
  { value: FilterOperator.NOT_EQUALS, label: 'not equals', symbol: '≠' },
  { value: FilterOperator.CONTAINS, label: 'contains', symbol: '⊃', multiValue: true },
  { value: FilterOperator.NOT_CONTAINS, label: 'not contains', symbol: '⊅', multiValue: true },
  { value: FilterOperator.IN, label: 'in', symbol: '∈', multiValue: true },
  { value: FilterOperator.NOT_IN, label: 'not in', symbol: '∉', multiValue: true },
  { value: FilterOperator.IS_SET, label: 'is set', symbol: '✓', noValue: true },
  { value: FilterOperator.IS_NOT_SET, label: 'is not set', symbol: '✗', noValue: true },
  { value: FilterOperator.GT, label: 'greater than', symbol: '>' },
  { value: FilterOperator.GTE, label: 'greater or equal', symbol: '≥' },
  { value: FilterOperator.LT, label: 'less than', symbol: '<' },
  { value: FilterOperator.LTE, label: 'less or equal', symbol: '≤' },
]

const createFilter = (property: string, operator: FilterOperator, payload?: string | string[]): ActiveFilter => {
  const meta = OPERATORS.find(o => o.value === operator)
  if (!meta) throw new Error(`createFilter: unknown filter operator ${operator}`)
  if (meta.noValue) return { property, operator, kind: 'presence' }
  if (meta.multiValue) {
    const values = Array.isArray(payload) ? payload : payload ? [payload] : []
    return { property, operator, kind: 'multi', values }
  }
  const value = Array.isArray(payload) ? (payload[0] ?? '') : (payload ?? '')
  return { property, operator, kind: 'single', value }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const mergeUniqueValues = (existing: string[], input: string): string[] => {
  const incoming = input.split(',').map(v => v.trim()).filter(Boolean)
  if (incoming.length === 0) return existing
  const seen = new Set(existing)
  const next = [...existing]
  for (const item of incoming) {
    if (!seen.has(item)) {
      seen.add(item)
      next.push(item)
    }
  }
  return next
}


const getValuesEmptyMessage = (loaded: boolean, error: boolean): string => {
  if (!loaded) return 'Loading...'
  if (error) return 'Failed to load values'
  return 'No values'
}

// ── Suggestions hook ────────────────────────────────────────────────────────

const useSuggestions = (propertyKey: string, source: PropertySource, eventKind?: string) => {
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const requestKey = propertyKey ? `${source}|${eventKind ?? ''}|${propertyKey}` : ''
  const [result, setResult] = useState<{ key: string; suggestions: string[]; error: boolean }>({
    key: '',
    suggestions: [],
    error: false,
  })

  useEffect(() => {
    if (!propertyKey) return

    let cancelled = false
    const loadSuggestions = async () => {
      try {
        const resp = await insightsRPC.getPropertyValues({ propertyKey, source, eventKind: eventKind ?? '' }, { headers })
        if (!cancelled) {
          setResult({ key: requestKey, suggestions: resp.values, error: false })
        }
      } catch (err) {
        if (!cancelled) {
          console.error('getPropertyValues failed:', err)
          setResult({ key: requestKey, suggestions: [], error: true })
        }
      }
    }
    void loadSuggestions()
    return () => { cancelled = true }
  }, [propertyKey, source, eventKind, insightsRPC, headers, requestKey])

  const loaded = !requestKey || result.key === requestKey
  const error = loaded ? result.error : false
  const suggestions = loaded ? result.suggestions : []
  return { suggestions, loaded, error }
}

const useScopedSchema = (kindFilter?: string) => {
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const kind = kindFilter?.trim() ?? ''
  const [result, setResult] = useState<{ key: string; schema: GetFilterSchemaResponse | null; error: string | null }>({
    key: '',
    schema: null,
    error: null,
  })
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!kind || !headers) return

    let cancelled = false
    fetchSchemaForKind(kind, insightsRPC, headers, retryCount > 0 ? { force: true } : undefined)
      .then(resp => { if (!cancelled) setResult({ key: kind, schema: resp, error: null }) })
      .catch(err => {
        if (cancelled) return
        console.error(`getFilterSchema("${kind}") failed:`, err)
        setResult({ key: kind, schema: null, error: err instanceof Error ? err.message : 'Failed to load filter schema' })
      })
    return () => { cancelled = true }
  }, [kind, insightsRPC, headers, retryCount])

  const isCurrent = result.key === kind
  const schema = kind && isCurrent ? result.schema : null
  const schemaError = kind && isCurrent ? result.error : null
  return { schema, schemaError, retry: () => setRetryCount(c => c + 1) }
}

// ── Shared sub-components ────────────────────────────────────────────────────

const MultiValueEditor = ({
  values,
  onAdd,
  onRemove,
  onToggle,
  suggestions,
  loaded,
  error,
  footer,
}: {
  values: string[]
  onAdd: (input: string) => void
  onRemove: (value: string) => void
  onToggle: (value: string) => void
  suggestions: string[]
  loaded: boolean
  error: boolean
  footer?: React.ReactNode
}) => {
  const [multiInput, setMultiInput] = useState('')

  return (
    <div>
      {values.length > 0 && (
        <div className='flex flex-wrap gap-1 px-3 pt-2'>
          {values.map(v => (
            <span key={v} className='inline-flex items-center gap-1 text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded max-w-full'>
              <span className='truncate' title={v}>{v}</span>
              <button type='button' onClick={() => onRemove(v)} className='text-muted-foreground hover:text-foreground'>
                <X className='w-2.5 h-2.5' />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className='p-2 border-b border-border/60 flex items-center gap-1.5 min-w-0'>
        <input
          placeholder='Type value, Enter/comma to add'
          value={multiInput}
          onChange={e => setMultiInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              onAdd(multiInput)
              setMultiInput('')
            }
          }}
          className='flex-1 min-w-0 h-7 px-2 text-xs rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring font-mono'
          autoFocus
        />
        <Button
          size='sm'
          variant='outline'
          className='h-7 text-xs px-2 shrink-0'
          onClick={() => { onAdd(multiInput); setMultiInput('') }}
        >
          Add
        </Button>
      </div>
      <Command>
        <CommandInput placeholder='Search values...' className='text-xs' />
        <CommandList>
          <CommandEmpty className='py-3 text-xs'>{getValuesEmptyMessage(loaded, error)}</CommandEmpty>
          <CommandGroup>
            {suggestions.map(s => (
              <CommandItem key={s} value={s} onSelect={() => onToggle(s)} className='text-xs py-1.5 font-mono gap-1.5'>
                <Check className={cn('w-3 h-3 shrink-0', values.includes(s) ? 'opacity-100' : 'opacity-0')} />
                {s}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      {footer}
    </div>
  )
}

const SingleValueEditor = ({
  value,
  onChange,
  onCommit,
  suggestions,
  loaded,
  error,
  footer,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  suggestions: string[]
  loaded: boolean
  error: boolean
  footer?: React.ReactNode
}) => (
  <div>
    <div className='p-2 border-b border-border/60'>
      <input
        placeholder='Type a value...'
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onCommit() }}
        className='w-full h-7 px-2 text-xs rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring font-mono'
        autoFocus
      />
    </div>
    <Command>
      <CommandInput placeholder='Search values...' className='text-xs' />
      <CommandList>
        <CommandEmpty className='py-3 text-xs'>{getValuesEmptyMessage(loaded, error)}</CommandEmpty>
        <CommandGroup>
          {suggestions.map(s => (
            <CommandItem
              key={s}
              value={s}
              onSelect={() => onChange(s)}
              className='text-xs py-1.5 font-mono'
            >
              {s}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
    {footer}
  </div>
)

// ── Event Picker ────────────────────────────────────────────────────────────

const EventPopoverList = ({
  events,
  value,
  schemaError,
  getEventColor,
  onSelect,
}: {
  events: EventNameMeta[]
  value: string
  schemaError: string | null
  getEventColor?: (eventName: string) => string
  onSelect: (name: string) => void
}) => {
  const getEmptyMessage = () => {
    if (schemaError) return 'Failed to load events'
    if (events.length === 0) return 'Loading event names...'
    return 'No events found'
  }

  return (
    <Command>
      <CommandInput placeholder='Search events...' className='text-xs' />
      <CommandList>
        <CommandEmpty className='py-4 text-xs'>{getEmptyMessage()}</CommandEmpty>
        <CommandGroup>
          {[...events].sort((a, b) => Number(b.count - a.count)).map(ev => {
            const colors = getSeriesColor(ev.name)
            const customColor = getEventColor?.(ev.name)
            return (
              <CommandItem
                key={ev.name}
                value={ev.name}
                onSelect={() => onSelect(ev.name)}
                data-checked={value === ev.name}
                className='text-xs gap-1.5 py-1.5'
              >
                <span className='w-1 h-1 rounded-full shrink-0' style={{ backgroundColor: customColor ?? colors.dot }} />
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
  color,
  getEventColor,
}: {
  value: string
  onChange: (v: string) => void
  events: EventNameMeta[]
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
          <Plus className='w-3 h-3' />
          Event
        </PopoverTrigger>
        <PopoverContent align='start' className='w-64 p-0'>
          <EventPopoverList events={events} value={value} schemaError={schemaError} getEventColor={getEventColor} onSelect={name => { onChange(name); setOpen(false) }} />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <span className='inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7'>
      <span className='px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px]'>event</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className='px-2 h-full flex items-center gap-1.5 hover:bg-muted/40 transition-colors cursor-pointer'>
          <span className='w-1 h-1 rounded-full shrink-0' style={{ backgroundColor: color ?? colors?.dot }} />
          {value}
        </PopoverTrigger>
        <PopoverContent align='start' className='w-64 p-0'>
          <EventPopoverList events={events} value={value} schemaError={schemaError} getEventColor={getEventColor} onSelect={name => { onChange(name); setOpen(false) }} />
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
  const [propSource, setPropSource] = useState(PropertySource.UNSPECIFIED)
  const [op, setOp] = useState(FilterOperator.EQUALS)
  const [val, setVal] = useState('')
  const [vals, setVals] = useState<string[]>([])

  const opMeta = OPERATORS.find(o => o.value === op)
  const { suggestions, loaded, error } = useSuggestions(step === 'value' ? prop : '', propSource, kindFilter)

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
      onAdd(createFilter(prop, operator))
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
      onAdd(createFilter(prop, op, vals))
    } else {
      if (!val.trim()) return
      onAdd(createFilter(prop, op, val.trim()))
    }
    setOpen(false)
    reset()
  }

  const toggleVal = (v: string) => {
    setVals(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
  }

  const addMultiValues = (input: string) => setVals(prev => mergeUniqueValues(prev, input))

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
                    <span className='w-5 h-4 text-center text-muted-foreground font-mono text-[11px] inline-flex items-center justify-center shrink-0'>
                      {o.symbol}
                    </span>
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        {step === 'value' && opMeta?.multiValue && (
          <MultiValueEditor
            values={vals}
            onAdd={addMultiValues}
            onRemove={v => setVals(prev => prev.filter(x => x !== v))}
            onToggle={toggleVal}
            suggestions={suggestions}
            loaded={loaded}
            error={error}
            footer={
              <div className='border-t border-border px-3 py-2 flex justify-end'>
                <Button size='sm' className='h-6 text-xs px-3' onClick={commitFilter} disabled={vals.length === 0}>
                  Apply
                </Button>
              </div>
            }
          />
        )}

        {step === 'value' && !opMeta?.multiValue && (
          <SingleValueEditor
            value={val}
            onChange={setVal}
            onCommit={commitFilter}
            suggestions={suggestions}
            loaded={loaded}
            error={error}
            footer={
              <div className='border-t border-border px-3 py-2 flex justify-end'>
                <Button size='sm' className='h-6 text-xs px-3' onClick={commitFilter} disabled={!val.trim()}>
                  Apply
                </Button>
              </div>
            }
          />
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
  const [editInput, setEditInput] = useState('')

  let propSource = PropertySource.UNSPECIFIED
  if (schema) {
    if (schema.autoPropertyKeys.some(pk => pk.name === filter.property)) propSource = PropertySource.AUTO
    else if (schema.customPropertyKeys.some(pk => pk.name === filter.property)) propSource = PropertySource.CUSTOM
    else propSource = PropertySource.PROFILE
  }

  const { suggestions, loaded, error } = useSuggestions(editOpen ? filter.property : '', propSource, kindFilter)

  const commitEdit = () => {
    const next = editInput.trim()
    if (!next) return
    onUpdate(createFilter(filter.property, filter.operator, next))
    setEditOpen(false)
  }

  const addMultiValues = (input: string) => {
    if (filter.kind !== 'multi') return
    const next = mergeUniqueValues(filter.values, input)
    if (next.length !== filter.values.length) {
      onUpdate(createFilter(filter.property, filter.operator, next))
    }
  }
  const handleEditOpenChange = (next: boolean) => {
    setEditOpen(next)
    if (!next) {
      setEditInput('')
      return
    }
    if (filter.kind === 'single') setEditInput(filter.value)
  }

  let valueLabel: string | null = null
  if (filter.kind === 'multi') {
    valueLabel = filter.values.join(', ')
  } else if (filter.kind === 'single') {
    valueLabel = filter.value
  }

  return (
    <span className='inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7'>
      <span className='px-2 text-muted-foreground bg-muted/50 h-full flex items-center font-mono text-[11px]'>
        {filter.property}
      </span>
      <span className='px-1.5 text-muted-foreground/70 h-full flex items-center text-[10px]'>
        {op?.symbol}
      </span>
      {valueLabel !== null && (
        <Popover open={editOpen} onOpenChange={handleEditOpenChange}>
          <PopoverTrigger className='px-2 h-full flex items-center font-mono hover:bg-muted/40 transition-colors cursor-pointer'>
            <span className='max-w-56 truncate' title={valueLabel || '...'}>{valueLabel || '...'}</span>
          </PopoverTrigger>
          <PopoverContent align='start' className='w-52 p-0'>
            {filter.kind === 'multi' ? (
              <MultiValueEditor
                values={filter.values}
                onAdd={addMultiValues}
                onRemove={v => onUpdate(createFilter(filter.property, filter.operator, filter.values.filter(x => x !== v)))}
                onToggle={s => {
                  const isSelected = filter.values.includes(s)
                  const next = isSelected ? filter.values.filter(x => x !== s) : [...filter.values, s]
                  onUpdate(createFilter(filter.property, filter.operator, next))
                }}
                suggestions={suggestions}
                loaded={loaded}
                error={error}
              />
            ) : (
              <SingleValueEditor
                value={editInput}
                onChange={setEditInput}
                onCommit={commitEdit}
                suggestions={suggestions}
                loaded={loaded}
                error={error}
                footer={
                  <div className='border-t border-border px-3 py-2 flex justify-end'>
                    <Button
                      size='sm'
                      className='h-6 text-xs px-3'
                      onClick={commitEdit}
                      disabled={!editInput.trim()}
                    >
                      Apply
                    </Button>
                  </div>
                }
              />
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

// ── Event Query Row ──────────────────────────────────────────────────────────

const SERIES_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const EventQueryRow = ({
  entry,
  events,
  schema,
  schemaError,
  onUpdateKind,
  onRemove,
  onAddFilter,
  onRemoveFilter,
  onUpdateFilter,
  letter,
  color,
  children,
  getEventColor,
}: {
  entry: EventFilterEntry
  events: EventNameMeta[]
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  onUpdateKind: (kind: string) => void
  onRemove: () => void
  onAddFilter: (filter: ActiveFilter) => void
  onRemoveFilter: (filterIdx: number) => void
  onUpdateFilter: (filterIdx: number, filter: ActiveFilter) => void
  letter?: string
  color?: string
  children?: React.ReactNode
  getEventColor?: (eventName: string) => string
}) => {
  const { schema: scopedSchema, schemaError: scopedSchemaError, retry: retryScopedSchema } = useScopedSchema(entry.kind)
  const resolvedSchema = entry.kind ? scopedSchema : schema
  const resolvedSchemaError = entry.kind ? scopedSchemaError : schemaError

  return (
    <div className='flex items-center gap-2'>
      <div className='inline-flex min-w-0 items-center gap-2 flex-wrap rounded-md border border-border/60 bg-muted/20 px-2 py-1'>
        {letter && (
          <span className='flex items-center gap-1.5'>
            {color && <span className='w-2 h-2 rounded-full shrink-0' style={{ background: color }} />}
            <span className='text-[10px] font-semibold text-muted-foreground w-3'>{letter}</span>
          </span>
        )}
        <EventChip
          value={entry.kind}
          onChange={onUpdateKind}
          events={events}
          schemaError={resolvedSchemaError}
          color={color}
          getEventColor={getEventColor}
        />
        {entry.kind && (
          <>
            {entry.filters.map((f, fi) => (
              <FilterChip
                key={fi}
                filter={f}
                schema={resolvedSchema}
                kindFilter={entry.kind}
                onRemove={() => onRemoveFilter(fi)}
                onUpdate={next => onUpdateFilter(fi, next)}
              />
            ))}
            <FilterBuilder schema={resolvedSchema} schemaError={resolvedSchemaError} onAdd={onAddFilter} kindFilter={entry.kind} />
            {scopedSchemaError && (
              <button
                type='button'
                onClick={retryScopedSchema}
                className='text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer'
              >
                retry schema
              </button>
            )}
            {children}
          </>
        )}
      </div>
      <button
        type='button'
        onClick={onRemove}
        className='self-center p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer'
      >
        <X className='w-3 h-3' />
      </button>
    </div>
  )
}

// ── Event Filter Bar ─────────────────────────────────────────────────────────

export const EventFilterBar = ({
  filters,
  events,
  schema,
  schemaError,
  showLetters,
  seriesColors,
  renderRowExtra,
  maxEvents,
  getEventColor,
}: {
  filters: EventFiltersHandle
  events: EventNameMeta[]
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  showLetters?: boolean
  seriesColors?: { dot: string }[]
  renderRowExtra?: (index: number) => React.ReactNode
  maxEvents?: number
  getEventColor?: (eventName: string) => string
}) => (
  <div className='flex flex-col gap-1.5'>
    {filters.entries.map((entry, i) => (
      <EventQueryRow
        key={i}
        entry={entry}
        events={events}
        schema={schema}
        schemaError={schemaError}
        onUpdateKind={kind => filters.updateEventKind(i, kind)}
        onRemove={() => filters.removeEvent(i)}
        onAddFilter={filter => filters.addEventFilter(i, filter)}
        onRemoveFilter={fi => filters.removeEventFilter(i, fi)}
        onUpdateFilter={(fi, filter) => filters.updateEventFilter(i, fi, filter)}
        letter={showLetters ? SERIES_LETTERS[i] : undefined}
        color={showLetters && seriesColors ? seriesColors[i % seriesColors.length]?.dot : undefined}
        getEventColor={getEventColor}
      >
        {renderRowExtra?.(i)}
      </EventQueryRow>
    ))}
    {(maxEvents === undefined || filters.entries.length < maxEvents) && (
      <div className='flex items-center gap-2'>
        {showLetters && filters.entries.length > 0 && <span className='w-7' />}
        <EventChip
          value=''
          onChange={kind => { if (kind) filters.addEvent(kind) }}
          events={events}
          schemaError={schemaError}
          getEventColor={getEventColor}
        />
      </div>
    )}
  </div>
)
