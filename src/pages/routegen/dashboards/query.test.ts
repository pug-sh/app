import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import {
  type DashboardTile,
  DashboardTileSchema,
  InsightTileContentSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { AggregationType, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { createEntry } from '@/hooks/use-event-filters'
import { DEFAULT_USER_FLOW_CONFIG } from '../insights/user-flow'
import { buildInsightSpec, getInsightEditorDefaults } from './query'

const build = (insightType: InsightType, includeCookieless: boolean, includeBots = false, kind = 'page_view') =>
  buildInsightSpec({
    insightType,
    validEntries: [createEntry(kind, { aggregation: AggregationType.UNIQUE_USERS })],
    propFilters: [],
    breakdowns: [],
    userFlowConfig: DEFAULT_USER_FLOW_CONFIG,
    includeCookieless,
    includeBots,
  })

const tileWith = (includeCookieless: boolean) =>
  create(DashboardTileSchema, {
    content: {
      case: 'insight',
      value: create(InsightTileContentSchema, {
        spec: { insightType: InsightType.TRENDS, includeCookieless },
      }),
    },
  }) as DashboardTile

describe('buildInsightSpec cookieless opt-in', () => {
  // Four return sites, and the branch a tile takes is its insight type, so a flag wired into only
  // the trends one is invisible until someone saves a funnel.
  it('rides on every insight type the editor can build', () => {
    for (const insightType of [InsightType.TRENDS, InsightType.FUNNEL, InsightType.TOP_K, InsightType.MAP]) {
      expect(build(insightType, true).includeCookieless).toBe(true)
      expect(build(insightType, false).includeCookieless).toBe(false)
    }
    expect(build(InsightType.USER_FLOW, true).includeCookieless).toBe(true)
  })
})

describe('buildInsightSpec bots', () => {
  it('keeps the editor choice on every insight type', () => {
    for (const insightType of [InsightType.TRENDS, InsightType.FUNNEL, InsightType.TOP_K, InsightType.MAP]) {
      expect(build(insightType, false, true).includeBots).toBe(true)
      expect(build(insightType, false, false).includeBots).toBe(false)
    }
  })

  // A tile on crawler requests reads nothing with bots excluded, whichever slot the event sits in.
  it('includes bots for a crawler_request tile even with the chip off', () => {
    for (const insightType of [InsightType.TRENDS, InsightType.FUNNEL, InsightType.TOP_K, InsightType.MAP]) {
      expect(build(insightType, false, false, 'crawler_request').includeBots).toBe(true)
    }
  })
})

describe('getInsightEditorDefaults cookieless opt-in', () => {
  // The editor rebuilds the whole spec from its own state on every change, so a flag it fails to
  // seed is not merely unshown: reopening the tile and touching anything strips it.
  it('round-trips a saved tile through the editor state', () => {
    expect(getInsightEditorDefaults(tileWith(true)).includeCookieless).toBe(true)
    expect(getInsightEditorDefaults(tileWith(false)).includeCookieless).toBe(false)
  })

  // A tile saved before the field existed reads as excluded, which is what it was rendering.
  it('defaults a new tile to excluded', () => {
    expect(getInsightEditorDefaults(undefined).includeCookieless).toBe(false)
  })
})

describe('getInsightEditorDefaults bots', () => {
  const tileOn = (kind: string, includeBots: boolean) =>
    create(DashboardTileSchema, {
      content: {
        case: 'insight',
        value: create(InsightTileContentSchema, { spec: build(InsightType.TRENDS, false, includeBots, kind) }),
      },
    }) as DashboardTile

  it('round-trips the choice on an ordinary tile', () => {
    expect(getInsightEditorDefaults(tileOn('page_view', true)).includeBots).toBe(true)
    expect(getInsightEditorDefaults(tileOn('page_view', false)).includeBots).toBe(false)
  })

  // A crawler tile saves bots as included whatever the chip said, so editing it into a people query
  // must not keep them.
  it('does not read a crawler tile saved flag as the choice', () => {
    expect(getInsightEditorDefaults(tileOn('crawler_request', false)).includeBots).toBe(false)
  })
})
