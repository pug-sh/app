import { Check, ListOrdered, Ruler, Trophy } from 'lucide-react'
import { useMemo } from 'react'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { TopKQuery_Dimension } from '@/api/genproto/shared/insights/v1/insights_pb'
import { OptionChip } from '@/components/option-chip'
import { cn } from '@/lib/utils'
import { AGGREGATIONS, NUMERIC_AGGREGATIONS } from './constants'
import { filterNumericSchema } from './controls'
import { InsightPropertyChip } from './property-chip'
import { TOP_K_DIMENSIONS, TOP_K_LIMITS, TOP_K_USER_FORBIDDEN_METRICS, type TopKState } from './top-k'

// A checkbox-style toggle chip, sized to match the OptionChip siblings. Used for
// boolean options as a direct toggle (button state) rather than a popover, per the
// flat-interaction design direction.
const TopKToggleChip = ({
  label,
  checked,
  title,
  onChange,
}: {
  label: string
  checked: boolean
  title?: string
  onChange: (next: boolean) => void
}) => (
  <button
    type="button"
    aria-pressed={checked}
    title={title}
    onClick={() => onChange(!checked)}
    className={cn(
      'inline-flex items-center gap-1.5 h-7 px-2.5 text-xs border border-border rounded-md transition-colors',
      checked ? 'bg-muted/60 text-foreground' : 'text-muted-foreground hover:bg-muted/40',
    )}
  >
    <span
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
      )}
    >
      {checked && <Check className="size-2.5" />}
    </span>
    {label}
  </button>
)

// The chip row configuring a top-k insight: rank dimension, ranked property
// (PROPERTY dimension only), measure, measure property (numeric measures only),
// and limit. The optional event scope is edited via the shared EventFilterBar.
export const TopKControls = ({
  topK,
  onChange,
  schema,
  schemaError,
}: {
  topK: TopKState
  onChange: (next: TopKState) => void
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
}) => {
  const metricOptions = useMemo(() => {
    if (topK.dimension !== TopKQuery_Dimension.USER) return AGGREGATIONS
    return AGGREGATIONS.filter(option => !TOP_K_USER_FORBIDDEN_METRICS.has(option.value))
  }, [topK.dimension])
  const numericSchema = useMemo(() => filterNumericSchema(schema), [schema])

  const setDimension = (dimension: TopKQuery_Dimension) => {
    // Switching to USER can leave a forbidden metric selected — reset it.
    const metricInvalid = dimension === TopKQuery_Dimension.USER && TOP_K_USER_FORBIDDEN_METRICS.has(topK.metric)
    onChange({ ...topK, dimension, metric: metricInvalid ? AGGREGATIONS[0].value : topK.metric })
  }

  return (
    <>
      <OptionChip
        label="rank"
        icon={Trophy}
        options={TOP_K_DIMENSIONS}
        value={topK.dimension}
        onChange={setDimension}
      />
      {topK.dimension === TopKQuery_Dimension.PROPERTY && (
        <InsightPropertyChip
          label="property"
          value={topK.property}
          placeholder="Select property"
          schema={schema}
          schemaError={schemaError}
          onSelect={property => onChange({ ...topK, property })}
        />
      )}
      <OptionChip
        label="measure"
        icon={Ruler}
        options={metricOptions}
        value={topK.metric}
        onChange={metric => onChange({ ...topK, metric })}
      />
      {NUMERIC_AGGREGATIONS.has(topK.metric) && (
        <InsightPropertyChip
          label="property"
          value={topK.metricProperty}
          placeholder="Select numeric property"
          schema={numericSchema}
          schemaError={schemaError}
          onSelect={metricProperty => onChange({ ...topK, metricProperty })}
        />
      )}
      <OptionChip
        label="limit"
        icon={ListOrdered}
        options={TOP_K_LIMITS}
        value={topK.limit}
        onChange={limit => onChange({ ...topK, limit })}
      />
      <TopKToggleChip
        label="Omit $others"
        checked={topK.omitOthers}
        title="Drop the trailing $others bucket and show only the top results"
        onChange={omitOthers => onChange({ ...topK, omitOthers })}
      />
    </>
  )
}
