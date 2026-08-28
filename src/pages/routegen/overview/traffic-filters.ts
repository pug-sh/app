import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator, LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import { type ActiveFilter, createFilter } from '@/components/event-filters/filter-model'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import { readPropFiltersParam } from '@/hooks/use-filter-query-params'
import { formatCountryName } from '@/lib/location'

// Traffic cross-filters reuse the Insights property-filter model wholesale, down to the shared `pf`
// URL param. Same-property values are kept as one filter — EQUALS for one, IN for several.

// A plain event property, not an auto-property: the Flutter and React Native SDKs both send it as
// `screenName`. The one non-`$` key this view ranks and filters on.
export const SCREEN_NAME_PROPERTY = 'screenName'

// The backend resolves either off the event, but the source is what a restored `pf` filter
// round-trips through and what Insights reads to place the key in its picker.
const sourceOf = (property: string) => (property.startsWith('$') ? PropertySource.AUTO : PropertySource.CUSTOM)

const valuesOf = (filter: ActiveFilter) => {
  if (filter.kind === 'single') return [filter.value]
  if (filter.kind === 'multi') return filter.values
  return []
}

const makeFilter = (property: string, values: string[]) => {
  const source = sourceOf(property)
  if (values.length === 1) return createFilter(property, source, FilterOperator.EQUALS, values[0])
  return createFilter(property, source, FilterOperator.IN, values)
}

// `pf` is shared with Insights, which legitimately authors filters this view can't show: a NOT_EQUALS
// chips as if it were an inclusion, an is-set narrows every number with no chip to remove it by, and a
// key no panel ranks can't be toggled off at all. Restore only what a panel can undo, warn about the rest.
const isTrafficFilter = (filter: ActiveFilter) =>
  (filter.source === PropertySource.AUTO ||
    (filter.source === PropertySource.CUSTOM && filter.property === SCREEN_NAME_PROPERTY)) &&
  (filter.operator === FilterOperator.EQUALS || filter.operator === FilterOperator.IN) &&
  valuesOf(filter).length > 0

export const readTrafficFilters = (search?: string) => {
  const { filters, dropped } = readPropFiltersParam(search)
  const seen = new Set<string>()
  const kept = filters.filter(filter => {
    if (!isTrafficFilter(filter) || seen.has(filter.property)) return false
    seen.add(filter.property)
    return true
  })
  const lost = dropped + filters.length - kept.length
  return {
    filters: kept,
    parseWarning: lost > 0 ? `Could not restore ${lost} filter${lost === 1 ? '' : 's'} from URL` : null,
  }
}

// Preserves position; drops the filter entirely when `next` is empty.
const withValues = (filters: readonly ActiveFilter[], existing: ActiveFilter, property: string, next: string[]) =>
  filters.flatMap(filter => {
    if (filter !== existing) return [filter]
    if (next.length > 0) return [makeFilter(property, next)]
    return []
  })

export const toggleFilter = (filters: readonly ActiveFilter[], property: string, value: string) => {
  const existing = filters.find(filter => filter.property === property)
  if (!existing) return [...filters, makeFilter(property, [value])]
  const current = valuesOf(existing)
  const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
  return withValues(filters, existing, property, next)
}

// Single-select variant: sets `property` to exactly `value` (replacing any other values it held), or
// clears it when `value` is already its sole selection. For dimensions where only one value makes
// sense at a time — country, since the map is a one-country drilldown.
export const toggleSingleFilter = (filters: readonly ActiveFilter[], property: string, value: string) => {
  const existing = filters.find(filter => filter.property === property)
  if (!existing) return [...filters, makeFilter(property, [value])]
  const current = valuesOf(existing)
  const isSoleValue = current.length === 1 && current[0] === value
  return withValues(filters, existing, property, isSoleValue ? [] : [value])
}

// Remove a specific value (the filter chip's ✕); a no-op if it isn't active.
export const removeFilter = (filters: readonly ActiveFilter[], property: string, value: string) => {
  const existing = filters.find(filter => filter.property === property)
  if (!existing) return [...filters]
  return withValues(
    filters,
    existing,
    property,
    valuesOf(existing).filter(v => v !== value),
  )
}

// The values currently selected for `property` (empty when it isn't filtered).
export const filterValues = (filters: readonly ActiveFilter[], property: string) => {
  const existing = filters.find(filter => filter.property === property)
  return existing ? valuesOf(existing) : []
}

export const hasFilter = (filters: readonly ActiveFilter[], property: string, value: string) =>
  filterValues(filters, property).includes(value)

// A breakdown panel drops its own dimension so every value of it stays visible and togglable.
export const filtersExcept = (filters: readonly ActiveFilter[], exceptProperty?: string) =>
  exceptProperty ? filters.filter(filter => filter.property !== exceptProperty) : [...filters]

// One AND group, identical to the Insights page's buildInsightSpec. Empty in → no groups.
export const filterGroupFields = (filters: readonly ActiveFilter[]) => ({
  filterGroups: filters.length > 0 ? [{ filters: toProtoFilters(filters), operator: LogicalOperator.AND }] : [],
  filterGroupsOperator: LogicalOperator.AND,
})

export const filterChips = (filters: readonly ActiveFilter[]) =>
  filters.flatMap(filter => valuesOf(filter).map(value => ({ property: filter.property, value })))

const PROPERTY_LABELS: Record<string, string> = {
  $pathname: 'Page',
  [SCREEN_NAME_PROPERTY]: 'Screen',
  $referrerDomain: 'Referrer',
  $country: 'Country',
  $region: 'Region',
  $city: 'City',
  $browser: 'Browser',
  $os: 'OS',
  $device: 'Device',
  // Distinct from $device: a `pf` link can carry both, and two chips reading "Device" can't be told apart.
  $deviceModel: 'Device model',
  $appVersion: 'App version',
  $utmSource: 'Source',
  $utmMedium: 'Medium',
  $utmCampaign: 'Campaign',
}

export const filterPropertyLabel = (property: string) => PROPERTY_LABELS[property] ?? property.replace(/^\$/, '')

// $country is stored as an ISO alpha-2 code, shown as its name — matching the Countries breakdown.
export const filterValueLabel = (property: string, value: string) =>
  property === '$country' ? formatCountryName(value) : value
