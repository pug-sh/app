import { z } from 'zod'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'

// Validates a filter arriving from outside the app — a shared URL, a stored tile spec. The payload
// has to be checked per arm, not just the discriminant: `toProtoFilters` switches on `kind` and
// reads the fields that arm implies, so a `multi` filter with no `values` produces a filter message
// with an undefined field and a query that is wrong rather than rejected. Note this validates the
// payload against the *kind*, not the kind against the operator's arity — `parseActiveFilter` in
// `use-filter-query-params.ts` cross-checks that, and the backend's PropertyFilter CEL rules reject
// a mismatch outright.
const activeFilterFields = {
  property: z.string().min(1),
  source: z.nativeEnum(PropertySource),
  operator: z.nativeEnum(FilterOperator),
}

export const activeFilterSchema = z.discriminatedUnion('kind', [
  z.object({ ...activeFilterFields, kind: z.literal('single'), value: z.string() }),
  z.object({ ...activeFilterFields, kind: z.literal('multi'), values: z.array(z.string()) }),
  z.object({ ...activeFilterFields, kind: z.literal('presence') }),
  z.object({ ...activeFilterFields, kind: z.literal('range'), min: z.string(), max: z.string() }),
])

// Derived, not declared alongside the schema. As two hand-written declarations they drifted in one
// direction silently: adding an arm to the union only broke `toProtoFilters`' exhaustive switch, and
// adding the missing `case` compiled clean with the schema still four-armed. A filter of the new
// kind then failed `safeParse` and — because the parse covers the whole config — discarded the
// user's entire user-flow setup behind "Could not restore user flow from URL", which is the bug the
// restorable/runnable split exists to prevent. One declaration makes that unrepresentable.
export type ActiveFilter = z.infer<typeof activeFilterSchema>

export const FILTER_OPERATORS: readonly {
  value: FilterOperator
  label: string
  symbol?: string
  arity?: 'none' | 'list' | 'range'
}[] = [
  { value: FilterOperator.EQUALS, label: 'equals', symbol: '=' },
  { value: FilterOperator.NOT_EQUALS, label: 'not equals', symbol: '≠' },
  { value: FilterOperator.CONTAINS, label: 'contains', symbol: '⊃' },
  { value: FilterOperator.NOT_CONTAINS, label: 'not contains', symbol: '⊅' },
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

export const createFilter = (
  property: string,
  source: PropertySource,
  operator: FilterOperator,
  payload?: string | string[],
): ActiveFilter => {
  const meta = FILTER_OPERATORS.find(o => o.value === operator)
  if (!meta) throw new Error(`createFilter: unknown filter operator ${operator}`)
  switch (meta.arity) {
    case 'none':
      return { property, source, operator, kind: 'presence' }
    case 'list': {
      let values: string[]
      if (Array.isArray(payload)) values = payload
      else if (payload) values = [payload]
      else values = []
      return { property, source, operator, kind: 'multi', values }
    }
    case 'range': {
      const [min = '', max = ''] = Array.isArray(payload) ? payload : []
      return { property, source, operator, kind: 'range', min, max }
    }
    default: {
      const value = Array.isArray(payload) ? (payload[0] ?? '') : (payload ?? '')
      return { property, source, operator, kind: 'single', value }
    }
  }
}
