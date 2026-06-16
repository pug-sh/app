import type { PrimitiveAtom } from 'jotai'
import { useAtomValue } from 'jotai'
import { selectAtom } from 'jotai/utils'
import { type LucideIcon, Ruler } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { type GetFilterSchemaResponse, PropertyValueType } from '@/api/genproto/common/v1/filter_schema_pb'
import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { PropertyPickerList } from '@/components/event-filters'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { EntryId, EventFilterEntry } from '@/hooks/use-event-filters'
import { cn } from '@/lib/utils'
import { AGGREGATIONS, NUMERIC_AGGREGATIONS } from './constants'

const NUMERIC_VALUE_TYPES = new Set([PropertyValueType.INTEGER, PropertyValueType.FLOAT])

export const OptionChip = <T extends string | number>({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  stableWidth = false,
  isOptionDisabled,
}: {
  label: string
  icon?: LucideIcon
  options: readonly { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
  stableWidth?: boolean
  // Returns a disabled-reason (shown as a tooltip) for an option, or null when enabled.
  isOptionDisabled?: (value: T) => string | null
}) => {
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)
  const valueMinWidth = stableWidth
    ? `${Math.max(...options.map(option => option.label.length), current?.label.length ?? 0)}ch`
    : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7 cursor-pointer hover:bg-muted/40 transition-colors">
        <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px] gap-1">
          {Icon && <Icon className="w-3 h-3" />}
          {label}
        </span>
        <span className="px-2 h-full flex items-center" style={{ minWidth: valueMinWidth }}>
          {current?.label}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(stableWidth ? 'w-(--anchor-width)' : 'w-auto', 'p-1')}>
        <div className="flex flex-col gap-0.5">
          {options.map(opt => {
            const disabledReason = isOptionDisabled?.(opt.value) ?? null
            const disabled = disabledReason !== null
            let optionClassName = 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            if (opt.value === value) {
              optionClassName = 'bg-muted text-foreground font-medium'
            }
            if (disabled) {
              optionClassName = 'text-muted-foreground/40'
            }
            const button = (
              <button
                key={String(opt.value)}
                type="button"
                aria-disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'px-3 py-1.5 text-xs text-left rounded-md transition-colors',
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                  stableWidth && 'w-full whitespace-nowrap',
                  optionClassName,
                )}
              >
                {opt.label}
              </button>
            )
            if (!disabled) return button
            return (
              <Tooltip key={String(opt.value)}>
                <TooltipTrigger render={button} />
                <TooltipContent side="right" className="text-xs">
                  {disabledReason}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const RowAggregationPicker = memo(
  ({
    entryId,
    filtersAtom,
    setAggregation,
  }: {
    entryId: EntryId
    filtersAtom: PrimitiveAtom<EventFilterEntry[]>
    setAggregation: (id: EntryId, agg: AggregationType) => void
  }) => {
    const aggregationAtom = useMemo(
      () =>
        selectAtom(filtersAtom, entries => entries.find(e => e.id === entryId)?.aggregation ?? AggregationType.TOTAL),
      [filtersAtom, entryId],
    )
    const value = useAtomValue(aggregationAtom)
    return (
      <OptionChip
        label="measure"
        icon={Ruler}
        options={AGGREGATIONS}
        value={value}
        onChange={v => setAggregation(entryId, v)}
      />
    )
  },
)

export const filterNumericSchema = (schema: GetFilterSchemaResponse | null): GetFilterSchemaResponse | null => {
  if (!schema) return null
  return {
    ...schema,
    autoPropertyKeys: schema.autoPropertyKeys.filter(pk => NUMERIC_VALUE_TYPES.has(pk.valueType)),
    customPropertyKeys: schema.customPropertyKeys.filter(pk => NUMERIC_VALUE_TYPES.has(pk.valueType)),
    profilePropertyKeys: schema.profilePropertyKeys.filter(pk => NUMERIC_VALUE_TYPES.has(pk.valueType)),
  }
}

const RowAggregationPropertyPicker = memo(
  ({
    entryId,
    filtersAtom,
    schema,
    schemaError,
    setAggregationProperty,
  }: {
    entryId: EntryId
    filtersAtom: PrimitiveAtom<EventFilterEntry[]>
    schema: GetFilterSchemaResponse | null
    schemaError: string | null
    setAggregationProperty: (id: EntryId, property: string) => void
  }) => {
    const [open, setOpen] = useState(false)
    const propertyAtom = useMemo(
      () => selectAtom(filtersAtom, entries => entries.find(e => e.id === entryId)?.aggregationProperty ?? ''),
      [filtersAtom, entryId],
    )
    const value = useAtomValue(propertyAtom)
    const numericSchema = useMemo(() => filterNumericSchema(schema), [schema])

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7 cursor-pointer hover:bg-muted/40 transition-colors">
          <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px]">property</span>
          <span className={cn('px-2 h-full flex items-center', !value && 'text-muted-foreground')}>
            {value || 'Select numeric property'}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <PropertyPickerList
            schema={numericSchema}
            schemaError={schemaError}
            placeholder="Aggregate property..."
            mode={{ kind: 'pick' }}
            onSelect={name => {
              setAggregationProperty(entryId, name)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    )
  },
)

export const InsightsRowAggregationControls = ({
  entry,
  rowSchema,
  rowSchemaError,
  filtersAtom,
  setAggregation,
  setAggregationProperty,
}: {
  entry: EventFilterEntry
  rowSchema: GetFilterSchemaResponse | null
  rowSchemaError: string | null
  filtersAtom: PrimitiveAtom<EventFilterEntry[]>
  setAggregation: (id: EntryId, agg: AggregationType) => void
  setAggregationProperty: (id: EntryId, property: string) => void
}) => (
  <>
    <RowAggregationPicker entryId={entry.id} filtersAtom={filtersAtom} setAggregation={setAggregation} />
    {NUMERIC_AGGREGATIONS.has(entry.aggregation ?? AggregationType.TOTAL) && (
      <RowAggregationPropertyPicker
        entryId={entry.id}
        filtersAtom={filtersAtom}
        schema={rowSchema}
        schemaError={rowSchemaError}
        setAggregationProperty={setAggregationProperty}
      />
    )}
  </>
)
