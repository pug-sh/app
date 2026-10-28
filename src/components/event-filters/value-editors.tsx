import { Check, X } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { CountryFlag } from '@/components/country-flag'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  COUNTRY_PROPERTY,
  knownPropertyValues,
  labelsPropertyValues,
  propertyValueKeywords,
  propertyValueLabel,
  resolvePropertyValue,
} from '@/lib/property-values'
import { cn } from '@/lib/utils'
import { splitValues } from './utils'

const filterInputCls =
  'h-7 px-2 text-xs rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring aria-invalid:border-destructive aria-invalid:focus:ring-destructive/40 font-mono'

const getValuesEmptyMessage = (loaded: boolean, error: boolean): string => {
  if (!loaded) return 'Loading...'
  if (error) return 'Failed to load values'
  return 'No values'
}

type ValueOption = { value: string; label: string; keywords: string[] }

const byLabel = (a: ValueOption, b: ValueOption) => a.label.localeCompare(b.label)

// Suggestions are what the property held lately, capped at 100. A property with a closed value set
// lists the rest of it below them, so a country can be picked before it shows up in the data.
const valueOptions = (property: string, suggestions: string[]) => {
  if (!labelsPropertyValues(property)) {
    return { seen: suggestions.map(value => ({ value, label: value, keywords: [] })), other: [] }
  }
  const toOption = (value: string) => ({
    value,
    label: propertyValueLabel(property, value),
    keywords: propertyValueKeywords(property, value),
  })
  const seen = new Set(suggestions)
  return {
    seen: suggestions.map(toOption).sort(byLabel),
    other: knownPropertyValues(property)
      .filter(value => !seen.has(value))
      .map(toOption)
      .sort(byLabel),
  }
}

const OptionLabel = ({ property, option }: { property: string; option: ValueOption }) => {
  if (option.label === option.value) return option.value
  return (
    <>
      {property === COUNTRY_PROPERTY && <CountryFlag code={option.value} />}
      <span className="flex-1 truncate">{option.label}</span>
      <span data-slot="command-shortcut" className="shrink-0 font-mono text-faint">
        {option.value}
      </span>
    </>
  )
}

const ValueOptionList = ({
  property,
  suggestions,
  loaded,
  error,
  selected,
  onSelect,
  className,
}: {
  property: string
  suggestions: string[]
  loaded: boolean
  error: boolean
  selected?: string[]
  onSelect: (option: ValueOption) => void
  className?: string
}) => {
  // Held back until suggestions land, so the seen values don't move the list under the pointer.
  const { seen, other } = useMemo(
    () => (loaded ? valueOptions(property, suggestions) : { seen: [], other: [] }),
    [loaded, property, suggestions],
  )
  const split = seen.length > 0 && other.length > 0

  const renderItem = (option: ValueOption) => (
    <CommandItem
      key={option.value}
      value={option.value}
      keywords={option.keywords}
      onSelect={() => onSelect(option)}
      className={cn('text-xs py-1.5 gap-1.5', option.label === option.value && 'font-mono')}
    >
      {selected && (
        <Check className={cn('w-3 h-3 shrink-0', selected.includes(option.value) ? 'opacity-100' : 'opacity-0')} />
      )}
      <OptionLabel property={property} option={option} />
    </CommandItem>
  )

  return (
    <Command>
      <CommandInput placeholder="Search values..." className="text-xs" />
      <CommandList className={className}>
        <CommandEmpty className="py-3 text-xs">
          {getValuesEmptyMessage(loaded, error && other.length === 0)}
        </CommandEmpty>
        {error && other.length > 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Failed to load recent values</p>
        )}
        {seen.length > 0 && (
          <CommandGroup heading={split ? 'Seen recently' : undefined}>{seen.map(renderItem)}</CommandGroup>
        )}
        {split && <CommandSeparator />}
        {other.length > 0 && <CommandGroup>{other.map(renderItem)}</CommandGroup>}
      </CommandList>
    </Command>
  )
}

export const ApplyFooter = ({ onClick, disabled }: { onClick: () => void; disabled: boolean }) => (
  <div className="border-t border-border px-3 py-2 flex justify-end">
    <Button size="sm" className="h-6 text-xs px-3" onClick={onClick} disabled={disabled}>
      Apply
    </Button>
  </div>
)

export const MultiValueEditor = ({
  property,
  values,
  onAdd,
  onRemove,
  onToggle,
  suggestions,
  loaded,
  error,
  footer,
}: {
  property: string
  values: string[]
  onAdd: (values: string[]) => void
  onRemove: (value: string) => void
  onToggle: (value: string) => void
  suggestions: string[]
  loaded: boolean
  error: boolean
  footer?: React.ReactNode
}) => {
  const [multiInput, setMultiInput] = useState('')

  const addInput = () => {
    onAdd(splitValues(multiInput).map(value => resolvePropertyValue(property, value)))
    setMultiInput('')
  }

  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-2">
          {values.map(v => (
            <span
              key={v}
              className={cn(
                'inline-flex items-center gap-1 text-xs bg-muted px-1.5 py-0.5 rounded max-w-full',
                propertyValueLabel(property, v) === v && 'font-mono',
              )}
            >
              <span className="truncate" title={v}>
                {propertyValueLabel(property, v)}
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
              addInput()
            }
          }}
          className={cn(filterInputCls, 'flex-1 min-w-0', labelsPropertyValues(property) && 'font-sans')}
          autoFocus
        />
        <Button size="sm" variant="outline" className="h-7 text-xs px-2 shrink-0" onClick={addInput}>
          Add
        </Button>
      </div>
      <ValueOptionList
        property={property}
        suggestions={suggestions}
        loaded={loaded}
        error={error}
        selected={values}
        onSelect={option => onToggle(option.value)}
      />
      {footer}
    </div>
  )
}

// Live while typing, so polite: an alert would interrupt on every keystroke that flips it. The id is what
// the input's aria-describedby points at, so the message is read with the field and not only announced.
const FieldHint = ({ id, children }: { id: string; children: string }) => (
  <p id={id} role="status" className="mt-1.5 text-xs text-negative">
    {children}
  </p>
)

// A popover with a long list sits close to the bottom of the screen, and one that grows repositions
// itself, so a hint appearing would make it jump. While one shows, the list gives up its height:
// 18rem is the list's usual cap, 1.375rem the hint's margin (mt-1.5) plus its one line (text-xs).
const HINT_ROOM_LIST = 'max-h-[calc(18rem-1.375rem)]'

export const SingleValueEditor = ({
  property,
  value,
  onChange,
  onCommit,
  suggestions,
  loaded,
  error,
  hint,
  footer,
}: {
  property: string
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  suggestions: string[]
  loaded: boolean
  error: boolean
  hint?: string
  footer?: React.ReactNode
}) => {
  const [typed, setTyped] = useState('')
  const hintId = useId()
  // `value` is the stored code; the input keeps what was typed while it still means that code, and
  // otherwise names the code only if the name resolves back to it (a $locale name never does).
  const label = propertyValueLabel(property, value)
  const shown = resolvePropertyValue(property, label) === value ? label : value
  const text = resolvePropertyValue(property, typed) === value ? typed : shown

  return (
    <div>
      <div className="p-2 border-b border-border/60">
        <input
          placeholder="Type a value..."
          value={text}
          onChange={e => {
            setTyped(e.target.value)
            onChange(resolvePropertyValue(property, e.target.value))
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') onCommit()
          }}
          aria-invalid={hint !== undefined}
          aria-describedby={hint ? hintId : undefined}
          className={cn(filterInputCls, 'w-full', labelsPropertyValues(property) && 'font-sans')}
          autoFocus
        />
        {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      </div>
      <ValueOptionList
        property={property}
        suggestions={suggestions}
        loaded={loaded}
        error={error}
        className={hint ? HINT_ROOM_LIST : undefined}
        onSelect={option => {
          setTyped('')
          onChange(option.value)
        }}
      />
      {footer}
    </div>
  )
}

export const BetweenValueEditor = ({
  min,
  max,
  onMinChange,
  onMaxChange,
  onCommit,
  hint,
  invalid,
  footer,
}: {
  min: string
  max: string
  onMinChange: (v: string) => void
  onMaxChange: (v: string) => void
  onCommit: () => void
  hint?: string
  invalid?: { min: boolean; max: boolean }
  footer?: React.ReactNode
}) => {
  const maxRef = useRef<HTMLInputElement>(null)
  const hintId = useId()
  return (
    <div>
      <div className="p-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <input
            placeholder="Min"
            value={min}
            onChange={e => onMinChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') maxRef.current?.focus()
            }}
            aria-invalid={invalid?.min}
            aria-describedby={hint ? hintId : undefined}
            className={cn(filterInputCls, 'flex-1 min-w-0')}
            autoFocus
          />
          <span className="text-xs text-muted-foreground shrink-0">–</span>
          <input
            ref={maxRef}
            placeholder="Max"
            value={max}
            onChange={e => onMaxChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onCommit()
            }}
            aria-invalid={invalid?.max}
            aria-describedby={hint ? hintId : undefined}
            className={cn(filterInputCls, 'flex-1 min-w-0')}
          />
        </div>
        {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      </div>
      {footer}
    </div>
  )
}
