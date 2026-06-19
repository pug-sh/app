import { describe, expect, it } from 'bun:test'
import { create } from '@bufbuild/protobuf'
import {
  AggregationType,
  InsightQuerySpecSchema,
  InsightType,
  TopKQuery_Dimension,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { createEntry } from '@/hooks/use-event-filters'
import { eventEntryCap } from '@/pages/routegen/insights/constants'
import {
  buildTopKQuery,
  DEFAULT_TOP_K,
  normalizeTopKState,
  parseTopKFromSpec,
  type TopKState,
  topKIncompleteReason,
  topKShareInfo,
  topKSpecIncompleteReason,
} from '@/pages/routegen/insights/top-k'

const D = TopKQuery_Dimension
const A = AggregationType

describe('normalizeTopKState', () => {
  it('returns defaults for empty input', () => {
    expect(normalizeTopKState({})).toEqual(DEFAULT_TOP_K)
  })

  it('rejects UNSPECIFIED dimension (0) and falls back to EVENT_KIND', () => {
    expect(normalizeTopKState({ dimension: 0 }).dimension).toBe(D.EVENT_KIND)
  })

  it('rejects out-of-range dimension', () => {
    expect(normalizeTopKState({ dimension: 99 }).dimension).toBe(D.EVENT_KIND)
  })

  it('rejects UNSPECIFIED metric (0) and falls back to TOTAL', () => {
    expect(normalizeTopKState({ metric: 0 }).metric).toBe(A.TOTAL)
  })

  it('rejects out-of-range metric', () => {
    expect(normalizeTopKState({ metric: 99 }).metric).toBe(A.TOTAL)
  })

  it('preserves a valid metric', () => {
    expect(normalizeTopKState({ metric: A.AVG, metricProperty: 'x' }).metric).toBe(A.AVG)
  })

  it('rewrites USER-forbidden metrics to TOTAL', () => {
    expect(normalizeTopKState({ dimension: D.USER, metric: A.UNIQUE_USERS }).metric).toBe(A.TOTAL)
    expect(normalizeTopKState({ dimension: D.USER, metric: A.PER_USER_AVG }).metric).toBe(A.TOTAL)
  })

  it('keeps UNIQUE_USERS for non-USER dimensions', () => {
    expect(normalizeTopKState({ dimension: D.EVENT_KIND, metric: A.UNIQUE_USERS }).metric).toBe(A.UNIQUE_USERS)
  })

  it('only accepts limits from the allowed set', () => {
    expect(normalizeTopKState({ limit: 100 }).limit).toBe(100)
    expect(normalizeTopKState({ limit: 7 }).limit).toBe(10)
    expect(normalizeTopKState({ limit: 1000 }).limit).toBe(10)
    expect(normalizeTopKState({ limit: '5' as unknown as number }).limit).toBe(10)
  })

  it('trims string fields and coerces non-strings to empty', () => {
    expect(normalizeTopKState({ dimension: D.PROPERTY, property: '  plan  ' }).property).toBe('plan')
    expect(normalizeTopKState({ property: 42 as unknown as string }).property).toBe('')
  })

  // S2: state must match what buildTopKQuery actually sends — no stale fields.
  it('strips property when dimension is not PROPERTY', () => {
    expect(normalizeTopKState({ dimension: D.EVENT_KIND, property: 'stale' }).property).toBe('')
  })

  it('keeps property when dimension is PROPERTY', () => {
    expect(normalizeTopKState({ dimension: D.PROPERTY, property: 'plan' }).property).toBe('plan')
  })

  it('strips metricProperty for non-numeric metrics', () => {
    expect(normalizeTopKState({ metric: A.TOTAL, metricProperty: 'stale' }).metricProperty).toBe('')
  })

  it('keeps metricProperty for numeric metrics', () => {
    expect(normalizeTopKState({ metric: A.SUM, metricProperty: 'revenue' }).metricProperty).toBe('revenue')
  })
})

describe('buildTopKQuery', () => {
  it('sends property only for the PROPERTY dimension', () => {
    expect(buildTopKQuery({ ...DEFAULT_TOP_K, dimension: D.EVENT_KIND, property: 'foo' }).property).toBe('')
    expect(buildTopKQuery({ ...DEFAULT_TOP_K, dimension: D.PROPERTY, property: 'plan' }).property).toBe('plan')
  })

  it('sends metricProperty only for numeric metrics', () => {
    expect(buildTopKQuery({ ...DEFAULT_TOP_K, metric: A.TOTAL, metricProperty: 'x' }).metricProperty).toBe('')
    expect(buildTopKQuery({ ...DEFAULT_TOP_K, metric: A.SUM, metricProperty: 'rev' }).metricProperty).toBe('rev')
  })

  it('omits scope when no scope entry is given', () => {
    expect(buildTopKQuery(DEFAULT_TOP_K).scope).toBeUndefined()
  })

  it('maps a scope entry onto the proto scope', () => {
    const scope = buildTopKQuery(DEFAULT_TOP_K, createEntry('purchase', { filters: [] })).scope
    expect(scope?.kind).toBe('purchase')
  })
})

describe('buildTopKQuery -> parseTopKFromSpec round-trip', () => {
  const states: TopKState[] = [
    { dimension: D.EVENT_KIND, property: '', metric: A.TOTAL, metricProperty: '', limit: 10 },
    { dimension: D.PROPERTY, property: 'plan', metric: A.TOTAL, metricProperty: '', limit: 5 },
    { dimension: D.USER, property: '', metric: A.SUM, metricProperty: 'revenue', limit: 100 },
    { dimension: D.EVENT_KIND, property: '', metric: A.UNIQUE_USERS, metricProperty: '', limit: 20 },
  ]

  for (const state of states) {
    it(`round-trips ${D[state.dimension]}/${A[state.metric]}`, () => {
      const spec = create(InsightQuerySpecSchema, { topK: buildTopKQuery(state) })
      expect(parseTopKFromSpec(spec)).toEqual(state)
    })
  }

  it('returns defaults for an absent spec or non-top-k spec', () => {
    expect(parseTopKFromSpec(undefined)).toEqual(DEFAULT_TOP_K)
    expect(parseTopKFromSpec(create(InsightQuerySpecSchema, { insightType: InsightType.TRENDS }))).toEqual(
      DEFAULT_TOP_K,
    )
  })
})

describe('topKIncompleteReason', () => {
  const base: TopKState = { dimension: D.EVENT_KIND, property: '', metric: A.TOTAL, metricProperty: '', limit: 10 }

  it('passes a complete event-kind ranking', () => {
    expect(topKIncompleteReason(base)).toBeNull()
  })

  it('requires a property for the PROPERTY dimension', () => {
    expect(topKIncompleteReason({ ...base, dimension: D.PROPERTY })).toBe('Select a property to rank')
    expect(topKIncompleteReason({ ...base, dimension: D.PROPERTY, property: '   ' })).toBe('Select a property to rank')
  })

  it('requires a metric property for numeric measures', () => {
    expect(topKIncompleteReason({ ...base, metric: A.SUM })).toBe('Select a numeric property for this measure')
  })

  // I3: forbidden USER metrics must be caught here so saved dashboard specs are
  // gated client-side, not only by the editor controls.
  it('rejects USER-forbidden metrics', () => {
    expect(topKIncompleteReason({ ...base, dimension: D.USER, metric: A.UNIQUE_USERS })).not.toBeNull()
    expect(topKIncompleteReason({ ...base, dimension: D.USER, metric: A.PER_USER_AVG })).not.toBeNull()
  })

  it('allows valid USER metrics', () => {
    expect(topKIncompleteReason({ ...base, dimension: D.USER, metric: A.TOTAL })).toBeNull()
  })
})

describe('topKSpecIncompleteReason', () => {
  it('reports a missing ranking config', () => {
    expect(topKSpecIncompleteReason(undefined)).toBe('Configure the ranking to start')
    expect(topKSpecIncompleteReason(create(InsightQuerySpecSchema, { insightType: InsightType.TOP_K }))).toBe(
      'Configure the ranking to start',
    )
  })

  it('passes a complete spec', () => {
    const spec = create(InsightQuerySpecSchema, { topK: buildTopKQuery(DEFAULT_TOP_K) })
    expect(topKSpecIncompleteReason(spec)).toBeNull()
  })
})

describe('eventEntryCap', () => {
  it('caps retention at 2 and top-k at 1', () => {
    expect(eventEntryCap(InsightType.RETENTION)).toBe(2)
    expect(eventEntryCap(InsightType.TOP_K)).toBe(1)
  })

  it('leaves trends and funnel uncapped', () => {
    expect(eventEntryCap(InsightType.TRENDS)).toBeUndefined()
    expect(eventEntryCap(InsightType.FUNNEL)).toBeUndefined()
  })
})

describe('topKShareInfo', () => {
  const rows = (vals: { value: number; isOthers?: boolean }[]) =>
    vals.map(v => ({ value: v.value, isOthers: !!v.isOthers }))

  it('computes share, ranked count and others share for additive metrics', () => {
    const info = topKShareInfo(rows([{ value: 60 }, { value: 30 }, { value: 10, isOthers: true }]), A.TOTAL)
    expect(info.total).toBe(100)
    expect(info.rankedCount).toBe(2)
    expect(info.showShare).toBe(true)
    expect(info.othersShare).toBeCloseTo(0.1)
  })

  // I1: UNIQUE_USERS is not additive across groups, so no share-of-total.
  it('does not show share for UNIQUE_USERS', () => {
    expect(topKShareInfo(rows([{ value: 60 }, { value: 40 }]), A.UNIQUE_USERS).showShare).toBe(false)
  })

  // S4: signed metrics (SUM/MIN of a property) can be negative; share is meaningless.
  it('does not show share when any value is negative', () => {
    expect(topKShareInfo(rows([{ value: 50 }, { value: -10 }]), A.SUM).showShare).toBe(false)
  })

  it('reports no share and null othersShare for an empty result', () => {
    const info = topKShareInfo([], A.TOTAL)
    expect(info.showShare).toBe(false)
    expect(info.othersShare).toBeNull()
    expect(info.rankedCount).toBe(0)
  })

  it('returns null othersShare when there is no others bucket', () => {
    const info = topKShareInfo(rows([{ value: 60 }, { value: 40 }]), A.TOTAL)
    expect(info.othersShare).toBeNull()
    expect(info.rankedCount).toBe(2)
  })

  it('clamps othersShare into [0, 1]', () => {
    const info = topKShareInfo(rows([{ value: -5 }, { value: 10, isOthers: true }]), A.TOTAL)
    expect(info.othersShare).toBe(1)
  })
})
