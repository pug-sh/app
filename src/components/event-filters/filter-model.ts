import type { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'

export type ActiveFilter =
  | { property: string; source: PropertySource; operator: FilterOperator; kind: 'single'; value: string }
  | { property: string; source: PropertySource; operator: FilterOperator; kind: 'multi'; values: string[] }
  | { property: string; source: PropertySource; operator: FilterOperator; kind: 'presence' }
  | { property: string; source: PropertySource; operator: FilterOperator; kind: 'range'; min: string; max: string }

export const FILTER_OPERATORS: readonly {
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
