import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { PropertyPickerList } from './pickers'
import { ApplyFooter, BetweenValueEditor, MultiValueEditor, SingleValueEditor } from './value-editors'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createFilter, FILTER_OPERATORS, type ActiveFilter } from '@/lib/filters/filter-model'
import { getAllowedOperators, getPropertyMeta } from '@/lib/filters/filter-operators'
import { cn } from '@/lib/utils'
import { ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSuggestions } from './hooks'
import { mergeUniqueValues } from './utils'

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

  const opMeta = FILTER_OPERATORS.find(o => o.value === op)
  const propertyMeta = useMemo(() => getPropertyMeta(schema, prop, propSource), [schema, prop, propSource])
  const allowedOperators = useMemo(() => getAllowedOperators(propertyMeta?.valueType), [propertyMeta?.valueType])
  const operatorOptions = useMemo(
    () => (allowedOperators ? FILTER_OPERATORS.filter(o => allowedOperators.has(o.value)) : FILTER_OPERATORS),
    [allowedOperators]
  )
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
    const meta = FILTER_OPERATORS.find(o => o.value === operator)
    if (meta?.arity === 'none') {
      onAdd(createFilter(prop, propSource, operator))
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
      onAdd(createFilter(prop, propSource, op, [min.trim(), max.trim()]))
    } else if (opMeta?.arity === 'list') {
      if (vals.length === 0) return
      onAdd(createFilter(prop, propSource, op, vals))
    } else {
      if (!val.trim()) return
      onAdd(createFilter(prop, propSource, op, val.trim()))
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
          <div className="max-h-72 overflow-auto p-1">
            {operatorOptions.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => pickOperator(o.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/50 cursor-pointer"
              >
                <span className="inline-flex h-4 w-5 shrink-0 items-center justify-center font-mono text-[11px] text-muted-foreground">
                  {o.symbol}
                </span>
                <span>{o.label}</span>
              </button>
            ))}
          </div>
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
