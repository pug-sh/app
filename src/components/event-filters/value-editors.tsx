import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { Check, X } from 'lucide-react'
import { useRef, useState } from 'react'

const filterInputCls =
  'h-7 px-2 text-xs rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring font-mono'

const getValuesEmptyMessage = (loaded: boolean, error: boolean): string => {
  if (!loaded) return 'Loading...'
  if (error) return 'Failed to load values'
  return 'No values'
}

export const ApplyFooter = ({ onClick, disabled }: { onClick: () => void; disabled: boolean }) => (
  <div className="border-t border-border px-3 py-2 flex justify-end">
    <Button size="sm" className="h-6 text-xs px-3" onClick={onClick} disabled={disabled}>
      Apply
    </Button>
  </div>
)

export const MultiValueEditor = ({
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

export const SingleValueEditor = ({
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

export const BetweenValueEditor = ({
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
