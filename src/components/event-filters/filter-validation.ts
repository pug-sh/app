import { create, createRegistry } from '@bufbuild/protobuf'
import { createValidator } from '@bufbuild/protovalidate'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { type FilterOperator, file_common_v1_filters, PropertyFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import { type ActiveFilter, createFilter } from './filter-model'
import { toProtoFilters } from './filter-proto'

// The same rules the transport enforces on every request, read from the descriptors the backend publishes.
const validator = createValidator({ registry: createRegistry(file_common_v1_filters) })

const validate = (filter: ActiveFilter) =>
  validator.validate(PropertyFilterSchema, create(PropertyFilterSchema, toProtoFilters([filter])[0]))

// The transport refuses a whole request over one invalid filter, so a bad dashboard filter would fail every tile.
export const filterViolation = (filter: ActiveFilter) => {
  const result = validate(filter)
  if (result.kind === 'invalid') return result.violations[0].message
  return result.error?.message
}

const NOT_NUMBER = 'Enter a valid number'
const NOT_NUMBERS = 'Enter valid numbers'

// Plain wording for the rules a value can break; the rule messages name proto fields (`values[0]`).
const hintFor = (filter: ActiveFilter, notNumber: string) => {
  const result = validate(filter)
  if (result.kind === 'invalid') {
    const { ruleId, message } = result.violations[0]
    if (ruleId === 'property_filter.numeric_value_required') return notNumber
    if (ruleId === 'property_filter.between_ordered_values') return "Min can't be above max"
    return message
  }
  // `between_ordered_values` compares with double(), which throws on a non-numeric string instead of
  // failing, so a bound that is not a number can surface as an evaluation error rather than a violation.
  if (result.kind === 'error') return notNumber
  return undefined
}

// Why the request validator would refuse this range, or undefined if it would take it. Silent until both
// bounds are typed, so the hint does not nag on a half-filled pair. Trims as the commit handlers do, so
// what passes here is exactly what gets sent.
export const rangeHint = (operator: FilterOperator, min: string, max: string) => {
  const low = min.trim()
  const high = max.trim()
  if (!low || !high) return undefined
  return hintFor(createFilter('range', PropertySource.CUSTOM, operator, [low, high]), NOT_NUMBERS)
}

// The same for a single value. Which operators need a number is the validator's call, not a list kept
// here: gt/gte/lt/lte come back with a hint for text, equals/contains never do.
export const numberHint = (operator: FilterOperator, value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return hintFor(createFilter('value', PropertySource.CUSTOM, operator, trimmed), NOT_NUMBER)
}

// Which bound to mark when `rangeHint` has something to say: the one that is not a number, or both when
// each is fine alone and only the pair is wrong. A bound is checked against itself, which can only fail
// the numeric rule.
export const rangeInvalidBounds = (operator: FilterOperator, min: string, max: string) => {
  if (rangeHint(operator, min, max) === undefined) return { min: false, max: false }
  const minBad = rangeHint(operator, min, min) !== undefined
  const maxBad = rangeHint(operator, max, max) !== undefined
  if (!minBad && !maxBad) return { min: true, max: true }
  return { min: minBad, max: maxBad }
}
