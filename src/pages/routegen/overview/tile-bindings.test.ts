import { describe, expect, it } from 'vitest'
import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import { pickBindings } from './tile-bindings'

const events = (...entries: [string, number][]) =>
  entries.map(([name, count]) => ({ name, count: BigInt(count) }) as EventNameMeta)

describe('pickBindings', () => {
  // page_view and screen_view are two spellings of one event, so the order they're listed in can't
  // decide: a mobile project with a handful of stray page_views would bind every product tile to it.
  it('binds primary to the busier navigation event, not the first one listed', () => {
    expect(pickBindings(events(['page_view', 3], ['screen_view', 4_000_000]))?.primary).toBe('screen_view')
    expect(pickBindings(events(['screen_view', 12], ['page_view', 900]))?.primary).toBe('page_view')
  })

  // On an exact tie the schema's event order can't decide either, or product mode binds to
  // screen_view while traffic mode's resolveNavEvent picks page_view for the same project.
  it('breaks an equal-count tie on candidate order, whichever way the schema lists them', () => {
    expect(pickBindings(events(['page_view', 500], ['screen_view', 500]))?.primary).toBe('page_view')
    expect(pickBindings(events(['screen_view', 500], ['page_view', 500]))?.primary).toBe('page_view')
  })

  it('falls back to the busiest non-autocapture event when there is no navigation event', () => {
    expect(pickBindings(events(['click', 5_000], ['purchase', 40]))?.primary).toBe('purchase')
  })

  it('resolves the other bindings by convention order', () => {
    const bindings = pickBindings(events(['page_view', 10], ['signup', 4], ['purchase', 2]))
    expect(bindings?.signinLike).toBe('signup')
    expect(bindings?.conversionLike).toBe('purchase')
    expect(bindings?.revenueLike).toBe('purchase')
  })

  it('is null for a project with no events', () => {
    expect(pickBindings([])).toBeNull()
  })
})
