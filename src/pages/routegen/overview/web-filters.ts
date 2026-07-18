import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator, LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import { type ActiveFilter, createFilter } from '@/components/event-filters/filter-model'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import { readPropFiltersParam } from '@/hooks/use-filter-query-params'
import { formatCountryName } from '@/lib/location'

// Web-analytics cross-filters reuse the Insights property-filter model wholesale: they're
// `ActiveFilter`s on auto-properties, persisted via the shared `pf` URL param and turned into proto
// filter groups by `toProtoFilters`. Same-property values are kept as one filter — EQUALS for a
// single value, IN for several — so the set ANDs across properties and ORs within one, and the `pf`
// param means the same thing here as on the Insights page.

const AUTO = PropertySource.AUTO

// Values a filter currently selects (single → [value], multi → values, presence/range → none).
const valuesOf = (filter: ActiveFilter) => {
  if (filter.kind === 'single') return [filter.value]
  if (filter.kind === 'multi') return filter.values
  return []
}

const makeFilter = (property: string, values: string[]) => {
  if (values.length === 1) return createFilter(property, AUTO, FilterOperator.EQUALS, values[0])
  return createFilter(property, AUTO, FilterOperator.IN, values)
}

// Everything below reads a filter's *arity* (valuesOf) and never its operator, and finds a property's
// filter with `.find`. That's the whole sublanguage this view can represent: AUTO source, EQUALS or IN,
// one filter per property. `pf` is shared with Insights, which authors the rest of the grammar
// legitimately — and each of those degrades silently here. A NOT_EQUALS chips and highlights as if it
// were an inclusion, and the next click on that dimension rewrites it into one. An is-set produces no
// chip at all, so it narrows every number on the page with nothing on screen to remove. A second filter
// on the same property is invisible past the first. So restore only what this view can actually show.
const isWebFilter = (filter: ActiveFilter) =>
  filter.source === AUTO &&
  (filter.operator === FilterOperator.EQUALS || filter.operator === FilterOperator.IN) &&
  valuesOf(filter).length > 0

// Restore cross-filters from the URL, keeping only the representable ones and reporting the rest.
export const readWebFilters = (search?: string) => {
  const { filters, dropped } = readPropFiltersParam(search)
  const seen = new Set<string>()
  const kept = filters.filter(filter => {
    if (!isWebFilter(filter) || seen.has(filter.property)) return false
    seen.add(filter.property)
    return true
  })
  const lost = dropped + filters.length - kept.length
  return {
    filters: kept,
    parseWarning: lost > 0 ? `Could not restore ${lost} filter${lost === 1 ? '' : 's'} from URL` : null,
  }
}

// Rebuild the list with `property`'s values set to `next`, preserving position; drops the filter
// entirely when `next` is empty.
const withValues = (filters: readonly ActiveFilter[], existing: ActiveFilter, property: string, next: string[]) =>
  filters.flatMap(filter => {
    if (filter !== existing) return [filter]
    if (next.length > 0) return [makeFilter(property, next)]
    return []
  })

// Clicking a value toggles it within its property's filter.
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

// Filters minus those on `exceptProperty`. A breakdown panel drops its own dimension so every value
// of it stays visible and togglable while the page's other filters still apply.
export const filtersExcept = (filters: readonly ActiveFilter[], exceptProperty?: string) =>
  exceptProperty ? filters.filter(filter => filter.property !== exceptProperty) : [...filters]

// Proto filter-group fields to spread into an InsightQuerySpec — a single AND group over the shared
// `toProtoFilters` output, identical to the Insights page's buildInsightSpec. Empty in → no groups.
export const filterGroupFields = (filters: readonly ActiveFilter[]) => ({
  filterGroups: filters.length > 0 ? [{ filters: toProtoFilters(filters), operator: LogicalOperator.AND }] : [],
  filterGroupsOperator: LogicalOperator.AND,
})

// One removable chip per selected value (a multi filter expands to several chips).
export const filterChips = (filters: readonly ActiveFilter[]) =>
  filters.flatMap(filter => valuesOf(filter).map(value => ({ property: filter.property, value })))

// Human labels for the filter chips. Falls back to the raw key (minus the `$`) for anything unmapped.
const PROPERTY_LABELS: Record<string, string> = {
  $pathname: 'Page',
  $country: 'Country',
  $region: 'Region',
  $city: 'City',
  $browser: 'Browser',
  $os: 'OS',
  $device: 'Device',
  $utmSource: 'Source',
  $utmMedium: 'Medium',
  $utmCampaign: 'Campaign',
}

export const filterPropertyLabel = (property: string) => PROPERTY_LABELS[property] ?? property.replace(/^\$/, '')

// Display text for a filter value. $country is stored as an ISO alpha-2 code but shown as its country
// name — keeping the chips consistent with the Countries breakdown, which does the same. Every other
// property shows the value verbatim (the stored value is always the raw filter key).
export const filterValueLabel = (property: string, value: string) =>
  property === '$country' ? formatCountryName(value) : value
