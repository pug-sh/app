import { describe, expect, it } from 'vitest'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator, type PropertyFilter } from '@/api/genproto/common/v1/filters_pb'
import { fromProtoFilter, toProtoFilters } from './filter-proto'

const stored = (over: Partial<PropertyFilter>) =>
  ({ property: '$os', source: PropertySource.AUTO, value: '', values: [], ...over }) as PropertyFilter

const roundTrip = (filter: PropertyFilter) => toProtoFilters([fromProtoFilter(filter)])[0]

// The two directions dispatch on different things: fromProtoFilter switches on the *operator's*
// arity, toProtoFilters on the resulting `kind`. A stored tile spec goes out and back through both
// every time the Data tab is opened, so any disagreement rewrites the saved query.
describe('filter proto round trip', () => {
  it('preserves a single-value filter', () => {
    const filter = stored({ operator: FilterOperator.EQUALS, value: 'ios' })

    expect(fromProtoFilter(filter).kind).toBe('single')
    expect(roundTrip(filter)).toMatchObject({ value: 'ios', values: [] })
  })

  it('preserves a list filter', () => {
    const filter = stored({ operator: FilterOperator.IN, values: ['ios', 'android'] })

    expect(fromProtoFilter(filter).kind).toBe('multi')
    expect(roundTrip(filter)).toMatchObject({ value: '', values: ['ios', 'android'] })
  })

  it('preserves a presence filter', () => {
    const filter = stored({ operator: FilterOperator.IS_SET })

    expect(fromProtoFilter(filter).kind).toBe('presence')
    expect(roundTrip(filter)).toMatchObject({ value: '', values: [] })
  })

  it('preserves a range filter', () => {
    const filter = stored({ operator: FilterOperator.BETWEEN, values: ['1', '9'] })

    expect(fromProtoFilter(filter).kind).toBe('range')
    expect(roundTrip(filter)).toMatchObject({ values: ['1', '9'] })
  })

  // protobuf-es keeps an unrecognised open-enum value, so a spec written by another build can carry
  // an operator this one has no arity for. Falling through to `single` discarded the payload and
  // emitted `values: []` — the filter silently stopped filtering and every number went *up*. Worse,
  // merely opening the Data tab rebuilds and persists the spec, and it does so on the silent patch
  // path that records no undo step.
  it('keeps a list payload it cannot classify rather than discarding it', () => {
    const filter = stored({ operator: FilterOperator.UNSPECIFIED, values: ['ios', 'android'] })

    expect(roundTrip(filter)).toMatchObject({ values: ['ios', 'android'] })
  })

  it('keeps a single payload it cannot classify rather than discarding it', () => {
    const filter = stored({ operator: FilterOperator.UNSPECIFIED, value: 'ios' })

    expect(roundTrip(filter)).toMatchObject({ value: 'ios' })
  })
})
