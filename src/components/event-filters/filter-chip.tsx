import { X } from 'lucide-react'
import { useState } from 'react'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { resolvePropertyValue } from '@/lib/property-values'
import { cn } from '@/lib/utils'
import { type ActiveFilter, createFilter, FILTER_OPERATORS, filterValueLabel, filterValueNamed } from './filter-model'
import { numberHint, rangeHint, rangeInvalidBounds } from './filter-validation'
import { useSuggestions } from './hooks'
import { mergeUniqueValues } from './utils'
import { ApplyFooter, BetweenValueEditor, MultiValueEditor, SingleValueEditor } from './value-editors'

export const FilterChip = ({
  filter,
  onRemove,
  onUpdate,
  kindFilter,
}: {
  filter: ActiveFilter
  onRemove: () => void
  onUpdate: (f: ActiveFilter) => void
  kindFilter?: string
}) => {
  const op = FILTER_OPERATORS.find(o => o.value === filter.operator)
  const [editOpen, setEditOpen] = useState(false)
  const [editInput, setEditInput] = useState('')
  const [editInput2, setEditInput2] = useState('')

  const { suggestions, loaded, error } = useSuggestions(editOpen ? filter.property : '', filter.source, kindFilter)

  const rangeError = op?.arity === 'range' ? rangeHint(filter.operator, editInput, editInput2) : undefined
  const rangeInvalid = rangeError ? rangeInvalidBounds(filter.operator, editInput, editInput2) : undefined
  const valueError = filter.kind === 'single' ? numberHint(filter.operator, editInput) : undefined

  const commitEdit = () => {
    if (op?.arity === 'range') {
      const min = editInput.trim()
      const max = editInput2.trim()
      if (!min || !max || rangeError) return
      onUpdate(createFilter(filter.property, filter.source, filter.operator, [min, max]))
    } else {
      const next = resolvePropertyValue(filter.property, editInput.trim())
      if (!next || valueError) return
      onUpdate(createFilter(filter.property, filter.source, filter.operator, next))
    }
    setEditOpen(false)
  }

  const addMultiValues = (values: string[]) => {
    if (filter.kind !== 'multi') return
    const next = mergeUniqueValues(filter.values, values)
    if (next.length !== filter.values.length) {
      onUpdate(createFilter(filter.property, filter.source, filter.operator, next))
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

  const valueLabel = filterValueLabel(filter)

  return (
    <span className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7">
      {filter.source === PropertySource.PROFILE && (
        <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-xs border-r border-border/40">
          Profile
        </span>
      )}
      <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center font-mono text-xs">
        {filter.property}
      </span>
      <span className="px-1.5 text-faint h-full flex items-center text-xs">{op?.symbol}</span>
      {valueLabel !== null && (
        <Popover open={editOpen} onOpenChange={handleEditOpenChange}>
          <PopoverTrigger
            className={cn(
              'px-2 h-full flex items-center hover:bg-muted/40 transition-colors',
              !filterValueNamed(filter) && 'font-mono',
            )}
          >
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
                hint={rangeError}
                invalid={rangeInvalid}
                footer={
                  <ApplyFooter
                    onClick={commitEdit}
                    disabled={!editInput.trim() || !editInput2.trim() || rangeError !== undefined}
                  />
                }
              />
            ) : filter.kind === 'multi' ? (
              <MultiValueEditor
                property={filter.property}
                values={filter.values}
                onAdd={addMultiValues}
                onRemove={v =>
                  onUpdate(
                    createFilter(
                      filter.property,
                      filter.source,
                      filter.operator,
                      filter.values.filter(x => x !== v),
                    ),
                  )
                }
                onToggle={s => {
                  const isSelected = filter.values.includes(s)
                  const next = isSelected ? filter.values.filter(x => x !== s) : [...filter.values, s]
                  onUpdate(createFilter(filter.property, filter.source, filter.operator, next))
                }}
                suggestions={suggestions}
                loaded={loaded}
                error={error}
              />
            ) : (
              <SingleValueEditor
                property={filter.property}
                value={editInput}
                onChange={setEditInput}
                onCommit={commitEdit}
                suggestions={suggestions}
                loaded={loaded}
                error={error}
                hint={valueError}
                footer={<ApplyFooter onClick={commitEdit} disabled={!editInput.trim() || valueError !== undefined} />}
              />
            )}
          </PopoverContent>
        </Popover>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="px-1.5 h-full flex items-center text-faint hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}
