import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import {
  AggregationType,
  InsightQuerySpecSchema,
  InsightType,
  MapQuerySchema,
  type TopKRow,
  TopKRowSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { createEntry } from '@/hooks/use-event-filters'
import {
  buildMapQuery,
  countryCountsFromTopKRows,
  DEFAULT_MAP,
  mapSpecIncompleteReason,
  normalizeMapState,
} from './map'

const row = (dimensionValue: string, value: number, isOthers = false): TopKRow =>
  create(TopKRowSchema, { dimensionValue, value, isOthers })

describe('buildMapQuery', () => {
  it('carries the scope event and drops a metric property the measure does not use', () => {
    const query = buildMapQuery(
      { metric: AggregationType.UNIQUE_USERS, metricProperty: 'order_amount' },
      createEntry('page_view'),
    )
    expect(query.scope?.kind).toBe('page_view')
    expect(query.metric).toBe(AggregationType.UNIQUE_USERS)
    expect(query.metricProperty).toBe('')
  })

  it('keeps the metric property for numeric measures', () => {
    const query = buildMapQuery({ metric: AggregationType.SUM, metricProperty: 'order_amount' })
    expect(query.scope).toBeUndefined()
    expect(query.metricProperty).toBe('order_amount')
  })
})

describe('mapSpecIncompleteReason', () => {
  const spec = (metric: AggregationType, metricProperty = '') =>
    create(InsightQuerySpecSchema, {
      insightType: InsightType.MAP,
      map: create(MapQuerySchema, { metric, metricProperty }),
    })

  it('reports a missing map config', () => {
    expect(mapSpecIncompleteReason(create(InsightQuerySpecSchema, { insightType: InsightType.MAP }))).toBe(
      'Configure the map to start',
    )
  })

  it('reports a numeric measure with no property, and clears once one is picked', () => {
    expect(mapSpecIncompleteReason(spec(AggregationType.SUM))).toBe('Select a numeric property for this measure')
    expect(mapSpecIncompleteReason(spec(AggregationType.SUM, 'order_amount'))).toBeNull()
  })

  it('needs nothing beyond the measure for count-based metrics', () => {
    expect(mapSpecIncompleteReason(spec(AggregationType.TOTAL))).toBeNull()
  })
})

describe('normalizeMapState', () => {
  it('falls back to the default measure for an unknown one', () => {
    expect(normalizeMapState({ metric: 999 })).toEqual(DEFAULT_MAP)
  })

  it('drops a metric property that no longer applies', () => {
    expect(normalizeMapState({ metric: AggregationType.TOTAL, metricProperty: 'order_amount' }).metricProperty).toBe('')
  })
})

describe('countryCountsFromTopKRows', () => {
  it('uppercases to ISO alpha-2 and orders by count, then code', () => {
    expect(countryCountsFromTopKRows([row('in', 5), row('de', 9), row('us', 9)])).toEqual([
      { iso: 'DE', count: 9 },
      { iso: 'US', count: 9 },
      { iso: 'IN', count: 5 },
    ])
  })

  it('drops the $others bucket, empty codes and non-positive counts', () => {
    // The map query omits the bucket, so this only fires on a hand-built or migrated spec — but a
    // bucket row would resolve to no country and vanish without explanation.
    expect(countryCountsFromTopKRows([row('IN', 3), row('$others', 40, true), row('', 7), row('FR', 0)])).toEqual([
      { iso: 'IN', count: 3 },
    ])
  })
})
