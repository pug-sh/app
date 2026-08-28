import { describe, expect, it } from 'vitest'
import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  InsightType,
  SessionMetric,
  TopKQuery_Dimension,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { createFilter } from '@/components/event-filters/filter-model'
import {
  buildCountryMapQuery,
  buildEventKindTopKQuery,
  buildSessionBreakdownQuery,
  buildTopKBreakdownQuery,
  buildTrafficStatQuery,
  formatTrafficStatValue,
  NAV_KINDS,
  resolveNavEvent,
  TRAFFIC_STATS,
} from './traffic-queries'

const events = (...entries: ([string] | [string, number])[]) =>
  entries.map(([name, count = 1]) => ({ name, count: BigInt(count) }) as EventNameMeta)

describe('resolveNavEvent', () => {
  it('picks screen_view for a project that only sends it', () => {
    expect(resolveNavEvent(events(['app_opened'], ['screen_view'], ['purchase']))?.kind).toBe('screen_view')
  })

  it('prefers page_view when a project sends both at the same volume', () => {
    expect(resolveNavEvent(events(['screen_view'], ['page_view']))?.kind).toBe('page_view')
  })

  // One stray page_view — a retired landing page, a Flutter web build — used to pin a mobile project
  // to page_view, scoping every tile to an event it has three of.
  it('lets the busier navigation event win', () => {
    expect(resolveNavEvent(events(['page_view', 3], ['screen_view', 4_000_000]))?.kind).toBe('screen_view')
  })

  // Queries scope on the raw name, so a vendor spelling has to survive the resolve.
  it('resolves a vendor spelling but keeps the raw event name', () => {
    expect(resolveNavEvent(events(['Page Viewed']))).toEqual({ kind: 'page_view', name: 'Page Viewed' })
  })

  it('is null when a project sends neither', () => {
    expect(resolveNavEvent(events(['click'], ['purchase']))).toBeNull()
  })
})

describe('buildTrafficStatQuery', () => {
  it('users is a navigation UNIQUE_USERS event, no session', () => {
    const spec = buildTrafficStatQuery('page_view', 'users', InsightType.SEGMENTATION).spec!
    expect(spec.insightType).toBe(InsightType.SEGMENTATION)
    expect(spec.session).toBeUndefined()
    expect(spec.events).toHaveLength(1)
    expect(spec.events[0].event?.kind).toBe('page_view')
    expect(spec.events[0].aggregation).toBe(AggregationType.UNIQUE_USERS)
  })

  it('pageviews is a navigation TOTAL event', () => {
    const spec = buildTrafficStatQuery('page_view', 'pageviews', InsightType.TRENDS).spec!
    expect(spec.insightType).toBe(InsightType.TRENDS)
    expect(spec.events[0].aggregation).toBe(AggregationType.TOTAL)
  })

  it('session stats set spec.session scoped to the navigation event and carry no events', () => {
    const spec = buildTrafficStatQuery('page_view', 'sessions', InsightType.SEGMENTATION).spec!
    expect(spec.events).toHaveLength(0)
    expect(spec.session?.metric).toBe(SessionMetric.SESSIONS)
    expect(spec.session?.scope?.kind).toBe('page_view')
  })

  it('maps each session stat to its metric', () => {
    const metricOf = (id: Parameters<typeof buildTrafficStatQuery>[1]) =>
      buildTrafficStatQuery('page_view', id, InsightType.SEGMENTATION).spec!.session?.metric
    expect(metricOf('bounceRate')).toBe(SessionMetric.BOUNCE_RATE)
    expect(metricOf('avgDuration')).toBe(SessionMetric.AVG_DURATION)
    expect(metricOf('pagesPerSession')).toBe(SessionMetric.AVG_EVENTS_PER_SESSION)
  })

  // The mobile half: SessionQuery.scope is a plain EventFilter server-side, so the session metrics
  // (sessions, bounce, duration, screens/session) work on screen_view exactly as they do on page_view.
  it('scopes both the event and session shapes to screen_view for a mobile project', () => {
    const event = buildTrafficStatQuery('screen_view', 'pageviews', InsightType.TRENDS).spec!
    expect(event.events[0].event?.kind).toBe('screen_view')

    const session = buildTrafficStatQuery('screen_view', 'bounceRate', InsightType.SEGMENTATION).spec!
    expect(session.session?.scope?.kind).toBe('screen_view')
  })
})

describe('breakdown queries', () => {
  it('topk breakdown ranks a property, scoped to the navigation event', () => {
    const spec = buildTopKBreakdownQuery('page_view', '$country', AggregationType.UNIQUE_USERS, [], 20).spec!
    expect(spec.insightType).toBe(InsightType.TOP_K)
    expect(spec.topK?.dimension).toBe(TopKQuery_Dimension.PROPERTY)
    expect(spec.topK?.property).toBe('$country')
    expect(spec.topK?.metric).toBe(AggregationType.UNIQUE_USERS)
    expect(spec.topK?.scope?.kind).toBe('page_view')
    expect(spec.topK?.limit).toBe(20)
  })

  it('event-kind topk is unscoped and totals', () => {
    const spec = buildEventKindTopKQuery().spec!
    expect(spec.topK?.dimension).toBe(TopKQuery_Dimension.EVENT_KIND)
    expect(spec.topK?.scope).toBeUndefined()
    expect(spec.topK?.metric).toBe(AggregationType.TOTAL)
  })

  it('session entry breakdown is TRENDS with exactly one breakdown', () => {
    const spec = buildSessionBreakdownQuery('page_view', SessionMetric.ENTRY, '$pathname').spec!
    expect(spec.insightType).toBe(InsightType.TRENDS)
    expect(spec.session?.metric).toBe(SessionMetric.ENTRY)
    expect(spec.session?.scope?.kind).toBe('page_view')
    expect(spec.breakdowns).toHaveLength(1)
    expect(spec.breakdowns[0].property).toBe('$pathname')
  })

  // screenName is a custom event property, not an auto-property: the top-K and breakdown property
  // expressions coalesce auto_properties then custom_properties, so it ranks like any other key.
  it('ranks a custom property for the mobile screens panel', () => {
    const topK = buildTopKBreakdownQuery('screen_view', 'screenName', AggregationType.TOTAL).spec!
    expect(topK.topK?.property).toBe('screenName')
    expect(topK.topK?.scope?.kind).toBe('screen_view')

    const entry = buildSessionBreakdownQuery('screen_view', SessionMetric.EXIT, 'screenName').spec!
    expect(entry.breakdowns[0].property).toBe('screenName')
    expect(entry.session?.scope?.kind).toBe('screen_view')
  })
})

// Every builder folds the page's cross-filters in via `...filterGroupFields(filters)`. Each spread is
// one line and its own failure: drop it from one builder and that panel quietly reports unfiltered
// numbers next to an active filter chip, which reads as real data. So assert it per builder.
describe('cross-filters reach every query', () => {
  const filters = [createFilter('$country', PropertySource.AUTO, FilterOperator.EQUALS, 'IN')]
  const groupOf = (query: { spec?: { filterGroups: { filters: { property: string }[] }[] } }) =>
    query.spec?.filterGroups

  it('stat queries carry them', () => {
    expect(
      groupOf(buildTrafficStatQuery('page_view', 'users', InsightType.SEGMENTATION, filters))?.[0].filters[0].property,
    ).toBe('$country')
  })

  it('top-k property breakdowns carry them', () => {
    expect(
      groupOf(buildTopKBreakdownQuery('page_view', '$browser', AggregationType.TOTAL, filters))?.[0].filters[0]
        .property,
    ).toBe('$country')
  })

  it('event-kind breakdowns carry them', () => {
    expect(groupOf(buildEventKindTopKQuery(filters))?.[0].filters[0].property).toBe('$country')
  })

  it('session entry/exit breakdowns carry them', () => {
    expect(
      groupOf(buildSessionBreakdownQuery('page_view', SessionMetric.ENTRY, '$pathname', filters))?.[0].filters[0]
        .property,
    ).toBe('$country')
  })

  it('the country map carries them', () => {
    expect(groupOf(buildCountryMapQuery('page_view', filters))?.[0].filters[0].property).toBe('$country')
  })

  it('no filters means no groups, not an empty group', () => {
    expect(groupOf(buildTrafficStatQuery('page_view', 'users', InsightType.SEGMENTATION))).toHaveLength(0)
  })
})

// Without the flag a wholly-cookieless referrer drops off the Visitors panels instead of ranking.
describe('cookieless visitors reach every query', () => {
  const included = (query: { spec?: { includeCookieless: boolean } }) => query.spec?.includeCookieless

  it('stat queries include them', () => {
    expect(included(buildTrafficStatQuery('page_view', 'users', InsightType.SEGMENTATION))).toBe(true)
  })

  it('top-k property breakdowns include them', () => {
    expect(included(buildTopKBreakdownQuery('page_view', '$referrerDomain', AggregationType.UNIQUE_USERS))).toBe(true)
  })

  it('event-kind breakdowns include them', () => {
    expect(included(buildEventKindTopKQuery())).toBe(true)
  })

  it('session entry/exit breakdowns include them', () => {
    expect(included(buildSessionBreakdownQuery('page_view', SessionMetric.ENTRY, '$pathname'))).toBe(true)
  })

  it('the country map includes them', () => {
    expect(included(buildCountryMapQuery('page_view'))).toBe(true)
  })
})

// The map query has no test of its own elsewhere, and useActivityMapData reads its shape positionally.
describe('buildCountryMapQuery', () => {
  it('is MAP scoped to the navigation event', () => {
    expect(buildCountryMapQuery('page_view').spec!.insightType).toBe(InsightType.MAP)
    expect(buildCountryMapQuery('page_view').spec!.map?.scope?.kind).toBe('page_view')
    expect(buildCountryMapQuery('screen_view').spec!.map?.scope?.kind).toBe('screen_view')
    expect(buildCountryMapQuery('page_view').spec!.map?.metric).toBe(AggregationType.TOTAL)
  })

  // The server rejects a MAP spec carrying either (map_no_events / map_no_breakdowns), so a
  // stray field here is a failed query, not a wider one.
  it('carries no events and no breakdowns', () => {
    const spec = buildCountryMapQuery('page_view').spec!
    expect(spec.events).toHaveLength(0)
    expect(spec.breakdowns).toHaveLength(0)
  })
})

describe('formatTrafficStatValue', () => {
  it('formats percent from a 0-100 value (no rescale)', () => {
    expect(formatTrafficStatValue('bounceRate', 42.5)).toBe('42.5%')
  })

  it('formats duration from seconds', () => {
    expect(formatTrafficStatValue('avgDuration', 45)).toBe('45s')
    expect(formatTrafficStatValue('avgDuration', 90)).toBe('1m 30s')
    expect(formatTrafficStatValue('avgDuration', 3661)).toBe('1h 1m')
  })

  it('formats pages/session with one decimal', () => {
    expect(formatTrafficStatValue('pagesPerSession', 2.345)).toBe('2.3')
  })

  it('compacts large counts', () => {
    expect(formatTrafficStatValue('users', 1500)).toBe('1.5K')
  })
})

// The flag half of the bounce-rate polarity fix: DeltaBadge honors `lowerIsBetter`, but only if the
// stat table sets it. Asserted as the whole list so a new falling-is-good metric has to land here.
describe('stat polarity', () => {
  it('marks bounce rate as the only lower-is-better stat', () => {
    expect(TRAFFIC_STATS.filter(stat => stat.lowerIsBetter).map(stat => stat.id)).toEqual(['bounceRate'])
  })
})

describe('stat labels', () => {
  it('names every stat in both vocabularies', () => {
    for (const stat of TRAFFIC_STATS) {
      for (const kind of NAV_KINDS) expect(stat.label[kind]).toBeTruthy()
    }
  })

  // A mobile project reading "Pageviews" over its screen views is the tell that the label table went
  // back to one vocabulary.
  it('reads a mobile project in screens, not pages', () => {
    const labelOf = (id: (typeof TRAFFIC_STATS)[number]['id']) =>
      TRAFFIC_STATS.find(stat => stat.id === id)?.label.screen_view
    expect(labelOf('pageviews')).toBe('Screen views')
    expect(labelOf('pagesPerSession')).toBe('Screens / session')
  })
})
