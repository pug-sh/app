import type { GetFilterSchemaResponse, PropertyKeyMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import { PropertySource, PropertyValueType } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'

const STRING_OPERATORS = new Set([
  FilterOperator.EQUALS,
  FilterOperator.NOT_EQUALS,
  FilterOperator.CONTAINS,
  FilterOperator.NOT_CONTAINS,
  FilterOperator.IN,
  FilterOperator.NOT_IN,
  FilterOperator.IS_SET,
  FilterOperator.IS_NOT_SET,
])

const ORDERED_OPERATORS = new Set([
  FilterOperator.EQUALS,
  FilterOperator.NOT_EQUALS,
  FilterOperator.IN,
  FilterOperator.NOT_IN,
  FilterOperator.IS_SET,
  FilterOperator.IS_NOT_SET,
  FilterOperator.GT,
  FilterOperator.GTE,
  FilterOperator.LT,
  FilterOperator.LTE,
  FilterOperator.BETWEEN,
  FilterOperator.NOT_BETWEEN,
])

const BOOLEAN_OPERATORS = new Set([
  FilterOperator.EQUALS,
  FilterOperator.NOT_EQUALS,
  FilterOperator.IS_SET,
  FilterOperator.IS_NOT_SET,
])

export const getPropertyMeta = (
  schema: GetFilterSchemaResponse | null,
  property: string,
  source: PropertySource,
): PropertyKeyMeta | null => {
  if (!schema) return null

  switch (source) {
    case PropertySource.AUTO:
      return schema.autoPropertyKeys.find(pk => pk.name === property) ?? null
    case PropertySource.CUSTOM:
      return schema.customPropertyKeys.find(pk => pk.name === property) ?? null
    case PropertySource.PROFILE:
      return schema.profilePropertyKeys.find(pk => pk.name === property) ?? null
    default:
      return null
  }
}

export const getAllowedOperators = (valueType: PropertyValueType | undefined) => {
  switch (valueType) {
    case PropertyValueType.STRING:
      return STRING_OPERATORS
    case PropertyValueType.INTEGER:
    case PropertyValueType.FLOAT:
    case PropertyValueType.DATETIME:
      return ORDERED_OPERATORS
    case PropertyValueType.BOOLEAN:
      return BOOLEAN_OPERATORS
    default:
      return null
  }
}
