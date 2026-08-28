import { Ruler } from 'lucide-react'
import { useMemo } from 'react'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { OptionChip } from '@/components/option-chip'
import { AGGREGATIONS, NUMERIC_AGGREGATIONS } from './constants'
import { filterNumericSchema } from './controls'
import type { MapState } from './map'
import { InsightPropertyChip } from './property-chip'

// The chip row configuring a map insight: just the measure, plus its property for numeric measures.
// There is no dimension chip — a map is always by country, which is what separates it from a top-k
// over $country — and no limit chip, since every country is returned.
export const MapControls = ({
  map,
  onChange,
  schema,
  schemaError,
}: {
  map: MapState
  onChange: (next: MapState) => void
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
}) => {
  const numericSchema = useMemo(() => filterNumericSchema(schema), [schema])

  return (
    <>
      <OptionChip
        label="measure"
        icon={Ruler}
        options={AGGREGATIONS}
        value={map.metric}
        onChange={metric => onChange({ ...map, metric })}
      />
      {NUMERIC_AGGREGATIONS.has(map.metric) && (
        <InsightPropertyChip
          label="property"
          value={map.metricProperty}
          placeholder="Select numeric property"
          schema={numericSchema}
          schemaError={schemaError}
          onSelect={metricProperty => onChange({ ...map, metricProperty })}
        />
      )}
    </>
  )
}
