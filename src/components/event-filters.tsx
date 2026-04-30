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
import type { PrimitiveAtom } from 'jotai'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, ChevronRight, Plus, X } from 'lucide-react'
import { getSeriesColor } from '@/lib/event-colors'
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createEntry } from '@/hooks/use-event-filters'
import type { EntryId, EventFilterEntry } from '@/hooks/use-event-filters'
import { fetchSchemaForKind } from '@/hooks/use-global-filter-schema'

// Stable empty array; passed to memoized children when events haven't loaded so
// their props identity stays constant across renders.
const EMPTY_EVENTS: EventNameMeta[] = []

// ── Types ───────────────────────────────────────────────────────────────────

export type ActiveFilter =
  | { property: string; operator: FilterOperator; kind: 'single'; value: string }
  | { property: string; operator: FilterOperator; kind: 'multi'; values: string[] }
  | { property: string; operator: FilterOperator; kind: 'presence' }
  | { property: string; operator: FilterOperator; kind: 'range'; min: string; max: string }

const OPERATORS: readonly {
  value: FilterOperator
  label: string
  symbol?: string
  arity?: 'none' | 'list' | 'range'
}[] = [
  { value: FilterOperator.EQUALS, label: 'equals', symbol: '=' },
  { value: FilterOperator.NOT_EQUALS, label: 'not equals', symbol: '≠' },
  { value: FilterOperator.CONTAINS, label: 'contains', symbol: '⊃', arity: 'list' },
  { value: FilterOperator.NOT_CONTAINS, label: 'not contains', symbol: '⊅', arity: 'list' },
  { value: FilterOperator.IN, label: 'in', symbol: '∈', arity: 'list' },
  { value: FilterOperator.NOT_IN, label: 'not in', symbol: '∉', arity: 'list' },
  { value: FilterOperator.IS_SET, label: 'is set', symbol: '✓', arity: 'none' },
  { value: FilterOperator.IS_NOT_SET, label: 'is not set', symbol: '✗', arity: 'none' },
  { value: FilterOperator.GT, label: 'greater than', symbol: '>' },
  { value: FilterOperator.GTE, label: 'greater or equal', symbol: '≥' },
  { value: FilterOperator.LT, label: 'less than', symbol: '<' },
  { value: FilterOperator.LTE, label: 'less or equal', symbol: '≤' },
  { value: FilterOperator.BETWEEN, label: 'between', symbol: '↔', arity: 'range' },
  { value: FilterOperator.NOT_BETWEEN, label: 'not between', symbol: '↮', arity: 'range' },
]

const createFilter = (property: string, operator: FilterOperator, payload?: string | string[]): ActiveFilter => {
  const meta = OPERATORS.find(o => o.value === operator)
  if (!meta) throw new Error(`createFilter: unknown filter operator ${operator}`)
  switch (meta.arity) {
    case 'none':
      return { property, operator, kind: 'presence' }
    case 'list': {
      let values: string[]
      if (Array.isArray(payload)) values = payload
      else if (payload) values = [payload]
      else values = []
      return { property, operator, kind: 'multi', values }
    }
    case 'range': {
      const [min = '', max = ''] = Array.isArray(payload) ? payload : []
      return { property, operator, kind: 'range', min, max }
    }
    default: {
      const value = Array.isArray(payload) ? (payload[0] ?? '') : (payload ?? '')
      return { property, operator, kind: 'single', value }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const mergeUniqueValues = (existing: string[], input: string): string[] => {
  const incoming = input
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
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

const getSchemaEmptyMessage = (schema: GetFilterSchemaResponse | null, schemaError: string | null): string => {
  if (schemaError) return 'Failed to load'
  if (schema) return 'No properties'
  return 'Loading...'
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
        const resp = await insightsRPC.getPropertyValues(
          { propertyKey, source, eventKind: eventKind ?? '' },
          { headers }
        )
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
    return () => {
      cancelled = true
    }
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
      .then(resp => {
        if (!cancelled) setResult({ key: kind, schema: resp, error: null })
      })
      .catch(err => {
        if (cancelled) return
        console.error(`getFilterSchema("${kind}") failed:`, err)
        setResult({
          key: kind,
          schema: null,
          error: err instanceof Error ? err.message : 'Failed to load filter schema',
        })
      })
    return () => {
      cancelled = true
    }
  }, [kind, insightsRPC, headers, retryCount])

  const isCurrent = result.key === kind
  const schema = kind && isCurrent ? result.schema : null
  const schemaError = kind && isCurrent ? result.error : null
  return { schema, schemaError, retry: () => setRetryCount(c => c + 1) }
}

// ── Shared sub-components ────────────────────────────────────────────────────

const filterInputCls =
  'h-7 px-2 text-xs rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring font-mono'

const ApplyFooter = ({ onClick, disabled }: { onClick: () => void; disabled: boolean }) => (
  <div className="border-t border-border px-3 py-2 flex justify-end">
    <Button size="sm" className="h-6 text-xs px-3" onClick={onClick} disabled={disabled}>
      Apply
    </Button>
  </div>
)

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
        <div className="flex flex-wrap gap-1 px-3 pt-2">
          {values.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded max-w-full"
            >
              <span className="truncate" title={v}>
                {v}
              </span>
              <button type="button" onClick={() => onRemove(v)} className="text-muted-foreground hover:text-foreground">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="p-2 border-b border-border/60 flex items-center gap-1.5 min-w-0">
        <input
          placeholder="Type value, Enter/comma to add"
          value={multiInput}
          onChange={e => setMultiInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              onAdd(multiInput)
              setMultiInput('')
            }
          }}
          className={cn(filterInputCls, 'flex-1 min-w-0')}
          autoFocus
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2 shrink-0"
          onClick={() => {
            onAdd(multiInput)
            setMultiInput('')
          }}
        >
          Add
        </Button>
      </div>
      <Command>
        <CommandInput placeholder="Search values..." className="text-xs" />
        <CommandList>
          <CommandEmpty className="py-3 text-xs">{getValuesEmptyMessage(loaded, error)}</CommandEmpty>
          <CommandGroup>
            {suggestions.map(s => (
              <CommandItem key={s} value={s} onSelect={() => onToggle(s)} className="text-xs py-1.5 font-mono gap-1.5">
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
    <div className="p-2 border-b border-border/60">
      <input
        placeholder="Type a value..."
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onCommit()
        }}
        className={cn(filterInputCls, 'w-full')}
        autoFocus
      />
    </div>
    <Command>
      <CommandInput placeholder="Search values..." className="text-xs" />
      <CommandList>
        <CommandEmpty className="py-3 text-xs">{getValuesEmptyMessage(loaded, error)}</CommandEmpty>
        <CommandGroup>
          {suggestions.map(s => (
            <CommandItem key={s} value={s} onSelect={() => onChange(s)} className="text-xs py-1.5 font-mono">
              {s}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
    {footer}
  </div>
)

const BetweenValueEditor = ({
  min,
  max,
  onMinChange,
  onMaxChange,
  onCommit,
  footer,
}: {
  min: string
  max: string
  onMinChange: (v: string) => void
  onMaxChange: (v: string) => void
  onCommit: () => void
  footer?: React.ReactNode
}) => {
  const maxRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div className="p-2 border-b border-border/60 flex items-center gap-2">
        <input
          placeholder="Min"
          value={min}
          onChange={e => onMinChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') maxRef.current?.focus()
          }}
          className={cn(filterInputCls, 'flex-1 min-w-0')}
          autoFocus
        />
        <span className="text-[11px] text-muted-foreground shrink-0">–</span>
        <input
          ref={maxRef}
          placeholder="Max"
          value={max}
          onChange={e => onMaxChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onCommit()
          }}
          className={cn(filterInputCls, 'flex-1 min-w-0')}
        />
      </div>
      {footer}
    </div>
  )
}

// ── Property Picker List (shared) ───────────────────────────────────────────

// Discriminated union: `selected` exists iff mode is 'multi-select', so the type
// forbids the "passed selected in pick mode" / "forgot selected in multi-select"
// invalid states the previous optional `selected?` allowed.
type PropertyPickerMode = { kind: 'pick' } | { kind: 'multi-select'; selected: ReadonlySet<string> }

const PropertyPickerList = ({
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
        {/* Backend orders property keys by count DESC; do not re-sort client-side. */}
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
      <CommandInput placeholder="Search events..." className="text-xs" />
      <CommandList>
        <CommandEmpty className="py-4 text-xs">{getEmptyMessage()}</CommandEmpty>
        <CommandGroup>
          {/* Backend orders by count DESC; do not re-sort client-side. */}
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
          <Plus className="w-3 h-3" />
          Event
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <EventPopoverList
            events={events}
            value={value}
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
    if (meta?.arity === 'none') {
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
    if (opMeta?.arity === 'range') {
      const [min, max] = vals
      if (!min?.trim() || !max?.trim()) return
      onAdd(createFilter(prop, op, [min.trim(), max.trim()]))
    } else if (opMeta?.arity === 'list') {
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
    setVals(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]))
  }

  const addMultiValues = (input: string) => setVals(prev => mergeUniqueValues(prev, input))

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const breadcrumb = (
    <div className="flex items-center gap-1 px-3 pt-2 pb-1 text-[10px] text-muted-foreground">
      {step !== 'property' && (
        <>
          <button
            type="button"
            onClick={() => {
              setStep('property')
              setProp('')
              setOp(FilterOperator.EQUALS)
            }}
            className="hover:text-foreground cursor-pointer"
          >
            Property
          </button>
          <ChevronRight className="w-2.5 h-2.5" />
          <span className="font-mono text-foreground">{prop}</span>
        </>
      )}
      {step === 'value' && (
        <>
          <ChevronRight className="w-2.5 h-2.5" />
          <button type="button" onClick={() => setStep('operator')} className="hover:text-foreground cursor-pointer">
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
        <Plus className="w-3 h-3" />
        Filter
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        {step !== 'property' && breadcrumb}

        {step === 'property' && (
          <PropertyPickerList
            schema={schema}
            schemaError={schemaError}
            placeholder="Filter by property..."
            mode={{ kind: 'pick' }}
            onSelect={(name, source) => pickProperty(name, source)}
          />
        )}

        {step === 'operator' && (
          <Command>
            <CommandList>
              <CommandGroup>
                {OPERATORS.map(o => (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => pickOperator(o.value)}
                    className="text-xs py-1.5 gap-2"
                  >
                    <span className="w-5 h-4 text-center text-muted-foreground font-mono text-[11px] inline-flex items-center justify-center shrink-0">
                      {o.symbol}
                    </span>
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        {step === 'value' && opMeta?.arity === 'range' && (
          <BetweenValueEditor
            min={vals[0] ?? ''}
            max={vals[1] ?? ''}
            onMinChange={v => setVals(prev => [v, prev[1] ?? ''])}
            onMaxChange={v => setVals(prev => [prev[0] ?? '', v])}
            onCommit={commitFilter}
            footer={<ApplyFooter onClick={commitFilter} disabled={!vals[0]?.trim() || !vals[1]?.trim()} />}
          />
        )}

        {step === 'value' && opMeta?.arity === 'list' && (
          <MultiValueEditor
            values={vals}
            onAdd={addMultiValues}
            onRemove={v => setVals(prev => prev.filter(x => x !== v))}
            onToggle={toggleVal}
            suggestions={suggestions}
            loaded={loaded}
            error={error}
            footer={<ApplyFooter onClick={commitFilter} disabled={vals.length === 0} />}
          />
        )}

        {step === 'value' && opMeta?.arity === undefined && (
          <SingleValueEditor
            value={val}
            onChange={setVal}
            onCommit={commitFilter}
            suggestions={suggestions}
            loaded={loaded}
            error={error}
            footer={<ApplyFooter onClick={commitFilter} disabled={!val.trim()} />}
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
  const [editInput2, setEditInput2] = useState('')

  let propSource = PropertySource.UNSPECIFIED
  if (schema) {
    if (schema.autoPropertyKeys.some(pk => pk.name === filter.property)) propSource = PropertySource.AUTO
    else if (schema.customPropertyKeys.some(pk => pk.name === filter.property)) propSource = PropertySource.CUSTOM
    else propSource = PropertySource.PROFILE
  }

  const { suggestions, loaded, error } = useSuggestions(editOpen ? filter.property : '', propSource, kindFilter)

  const commitEdit = () => {
    if (op?.arity === 'range') {
      const min = editInput.trim()
      const max = editInput2.trim()
      if (!min || !max) return
      onUpdate(createFilter(filter.property, filter.operator, [min, max]))
    } else {
      const next = editInput.trim()
      if (!next) return
      onUpdate(createFilter(filter.property, filter.operator, next))
    }
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
      setEditInput2('')
      return
    }
    if (filter.kind === 'single') setEditInput(filter.value)
    if (filter.kind === 'range') {
      setEditInput(filter.min)
      setEditInput2(filter.max)
    }
  }

  let valueLabel: string | null = null
  if (filter.kind === 'multi') {
    valueLabel = filter.values.join(', ')
  } else if (filter.kind === 'range') {
    valueLabel = `${filter.min} – ${filter.max}`
  } else if (filter.kind === 'single') {
    valueLabel = filter.value
  }

  return (
    <span className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7">
      <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center font-mono text-[11px]">
        {filter.property}
      </span>
      <span className="px-1.5 text-muted-foreground/70 h-full flex items-center text-[10px]">{op?.symbol}</span>
      {valueLabel !== null && (
        <Popover open={editOpen} onOpenChange={handleEditOpenChange}>
          <PopoverTrigger className="px-2 h-full flex items-center font-mono hover:bg-muted/40 transition-colors cursor-pointer">
            <span className="max-w-56 truncate" title={valueLabel || '...'}>
              {valueLabel || '...'}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-0">
            {filter.kind === 'range' ? (
              <BetweenValueEditor
                min={editInput}
                max={editInput2}
                onMinChange={setEditInput}
                onMaxChange={setEditInput2}
                onCommit={commitEdit}
                footer={<ApplyFooter onClick={commitEdit} disabled={!editInput.trim() || !editInput2.trim()} />}
              />
            ) : filter.kind === 'multi' ? (
              <MultiValueEditor
                values={filter.values}
                onAdd={addMultiValues}
                onRemove={v =>
                  onUpdate(
                    createFilter(
                      filter.property,
                      filter.operator,
                      filter.values.filter(x => x !== v)
                    )
                  )
                }
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
                footer={<ApplyFooter onClick={commitEdit} disabled={!editInput.trim()} />}
              />
            )}
          </PopoverContent>
        </Popover>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="px-1.5 h-full flex items-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

// ── Breakdown UI ─────────────────────────────────────────────────────────────

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

// ── Event Query Row ──────────────────────────────────────────────────────────

const SERIES_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const EventQueryRow = memo(
  ({
    filtersAtom,
    entry,
    events,
    schema,
    schemaError,
    letter,
    color,
    renderExtra,
    getEventColor,
  }: {
    filtersAtom: PrimitiveAtom<EventFilterEntry[]>
    entry: EventFilterEntry
    events: EventNameMeta[]
    schema: GetFilterSchemaResponse | null
    schemaError: string | null
    letter?: string
    color?: string
    renderExtra?: (entryId: EntryId) => React.ReactNode
    getEventColor?: (eventName: string) => string
  }) => {
    const setEntries = useSetAtom(filtersAtom)
    const {
      schema: scopedSchema,
      schemaError: scopedSchemaError,
      retry: retryScopedSchema,
    } = useScopedSchema(entry.kind)
    const resolvedSchema = entry.kind ? scopedSchema : schema
    const resolvedSchemaError = entry.kind ? scopedSchemaError : schemaError
    const { id: entryId } = entry

    const onUpdateKind = useCallback(
      (kind: string) => {
        const trimmed = kind.trim()
        if (!trimmed) {
          setEntries(prev => prev.filter(e => e.id !== entryId))
        } else {
          setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, kind: trimmed, filters: [] } : e)))
        }
      },
      [entryId, setEntries]
    )

    const onRemove = useCallback(() => {
      setEntries(prev => prev.filter(e => e.id !== entryId))
    }, [entryId, setEntries])

    const onAddFilter = useCallback(
      (filter: ActiveFilter) => {
        setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, filters: [...e.filters, filter] } : e)))
      },
      [entryId, setEntries]
    )

    const onRemoveFilter = useCallback(
      (filterIdx: number) => {
        setEntries(prev =>
          prev.map(e => (e.id === entryId ? { ...e, filters: e.filters.filter((_, fi) => fi !== filterIdx) } : e))
        )
      },
      [entryId, setEntries]
    )

    const onUpdateFilter = useCallback(
      (filterIdx: number, filter: ActiveFilter) => {
        setEntries(prev =>
          prev.map(e =>
            e.id === entryId ? { ...e, filters: e.filters.map((f, fi) => (fi === filterIdx ? filter : f)) } : e
          )
        )
      },
      [entryId, setEntries]
    )

    return (
      <div className="flex items-center gap-2">
        <div className="inline-flex min-w-0 items-center gap-2 flex-wrap rounded-md border border-border/60 bg-muted/20 px-2 py-1">
          {letter && (
            <span className="flex items-center gap-1.5">
              {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
              <span className="text-[10px] font-semibold text-muted-foreground w-3">{letter}</span>
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
              <FilterBuilder
                schema={resolvedSchema}
                schemaError={resolvedSchemaError}
                onAdd={onAddFilter}
                kindFilter={entry.kind}
              />
              {scopedSchemaError && (
                <button
                  type="button"
                  onClick={retryScopedSchema}
                  title={scopedSchemaError}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  retry schema
                </button>
              )}
              {renderExtra?.(entry.id)}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="self-center p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }
)

// ── Event Filter Bar ─────────────────────────────────────────────────────────

export const EventFilterBar = ({
  filtersAtom,
  events,
  schema,
  schemaError,
  showLetters,
  seriesColors,
  renderRowExtra,
  maxEvents,
  getEventColor,
}: {
  filtersAtom: PrimitiveAtom<EventFilterEntry[]>
  events?: EventNameMeta[]
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  showLetters?: boolean
  seriesColors?: { dot: string }[]
  renderRowExtra?: (entryId: EntryId) => React.ReactNode
  maxEvents?: number
  getEventColor?: (eventName: string) => string
}) => {
  const [entries, setEntries] = useAtom(filtersAtom)
  // Stable identity when events haven't loaded; keeps memoized children from churning.
  const safeEvents = events ?? EMPTY_EVENTS

  const addEvent = useCallback(
    (kind: string) => {
      const trimmed = kind.trim()
      if (!trimmed) return
      setEntries(prev => [...prev, createEntry(trimmed)])
    },
    [setEntries]
  )

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry, i) => (
        <EventQueryRow
          key={entry.id}
          filtersAtom={filtersAtom}
          entry={entry}
          events={safeEvents}
          schema={schema}
          schemaError={schemaError}
          letter={showLetters ? SERIES_LETTERS[i] : undefined}
          color={showLetters && seriesColors ? seriesColors[i % seriesColors.length]?.dot : undefined}
          renderExtra={renderRowExtra}
          getEventColor={getEventColor}
        />
      ))}
      {(maxEvents === undefined || entries.length < maxEvents) && (
        <div className="flex items-center gap-2">
          {showLetters && entries.length > 0 && <span className="w-7" />}
          <EventChip
            value=""
            onChange={kind => {
              if (kind) addEvent(kind)
            }}
            events={safeEvents}
            schemaError={schemaError}
            getEventColor={getEventColor}
          />
        </div>
      )}
    </div>
  )
}
