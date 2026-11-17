import { create } from '@bufbuild/protobuf'
import type { LucideIcon } from 'lucide-react'
import { BarChart3, Bot, DollarSign, FileText, Hash, LineChart, ListOrdered, Repeat, Trophy } from 'lucide-react'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
  ComparePeriod,
  type DashboardTileInput,
  DashboardTileInputSchema,
  DashboardTileViewMode,
  GridPositionSchema,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  BreakdownSchema,
  EventQuerySchema,
  InsightQuerySpecSchema,
  InsightType,
  TopKQuery_Dimension,
  TopKQuerySchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { CRAWLER_CATEGORY_PROPERTY, CRAWLER_NAME_PROPERTY, CRAWLER_REQUEST_EVENT } from '@/lib/crawlers'
import { type Bindings, composeFunnelSteps, pickBindings } from '../overview/tile-bindings'
import { BREAKDOWN_RESPONSE_LIMIT } from './constants'

export type TileTemplateId =
  | 'kpi-big-number'
  | 'daily-active-users'
  | 'signup-activation-funnel'
  | 'day-7-retention'
  | 'top-events'
  | 'revenue'
  | 'crawler-requests'
  | 'top-crawlers'
  | 'text-note'
  | 'custom-chart'

export type TileTemplateGroup = 'suggested' | 'blank'

// Resolved project context handed to each template's build(). Lets the suggested
// templates seed real, project-specific events the same way the overview page
// auto-derives its tiles, instead of opening an empty tile the user must fill in.
export type TemplateContext = {
  // Well-known event bindings (primary / signin-like / conversion-like), or null
  // when the project has no events yet, in which case suggested templates fall
  // back to an empty spec.
  bindings: Bindings | null
  // Event kinds sorted by volume (desc): the funnel template's fallback steps.
  topEventKinds: string[]
  hasCrawlerRequests: boolean
}

export const EMPTY_TEMPLATE_CONTEXT: TemplateContext = { bindings: null, topEventKinds: [], hasCrawlerRequests: false }

// Derive a TemplateContext from the project's filter schema. Reuses pickBindings
// (shared with the overview page) so both surfaces resolve the same canonical
// events from the same conventions.
export const buildTemplateContext = (schema: GetFilterSchemaResponse | null): TemplateContext => {
  if (!schema || schema.events.length === 0) return EMPTY_TEMPLATE_CONTEXT
  // Crawler requests are bot-only, so a people tile seeded with one counts nothing.
  const topEventKinds = [...schema.events]
    .sort((a, b) => Number(b.count - a.count))
    .map(event => event.name)
    .filter(kind => kind !== CRAWLER_REQUEST_EVENT)
  return {
    bindings: pickBindings(schema.events),
    topEventKinds,
    hasCrawlerRequests: schema.events.some(event => event.name === CRAWLER_REQUEST_EVENT),
  }
}

export type TileTemplate = {
  id: TileTemplateId
  group: TileTemplateGroup
  displayName: string
  description: string
  icon: LucideIcon
  // Optional gate: a template is only offered in the picker when this returns
  // true (or is absent). Used to hide tiles that are meaningless for the project
  // (e.g. Revenue only appears when a monetization event exists).
  isAvailable?: (ctx: TemplateContext) => boolean
  build: (ctx: TemplateContext) => DashboardTileInput
}

const positionFor = (w: number, h: number) => create(GridPositionSchema, { x: 0, y: 0, w, h })

type SeedEvent = { kind: string; aggregation?: AggregationType; aggregationProperty?: string }

const insightContent = (insightType: InsightType, events: SeedEvent[] = []) => ({
  case: 'insight' as const,
  value: create(InsightTileContentSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType,
      events: events.map(({ kind, aggregation, aggregationProperty }) =>
        create(EventQuerySchema, {
          event: create(EventFilterSchema, { kind }),
          aggregation: aggregation ?? AggregationType.TOTAL,
          aggregationProperty: aggregationProperty ?? '',
        }),
      ),
    }),
  }),
})

// Registry keyed by id so adding a new TileTemplateId forces a matching entry
// at compile time (TS errors on missing keys).
const TILE_TEMPLATES_BY_ID: Record<TileTemplateId, TileTemplate> = {
  'kpi-big-number': {
    id: 'kpi-big-number',
    group: 'blank',
    displayName: 'Big number (KPI)',
    description: 'Single metric with delta vs prior and a sparkline.',
    icon: Hash,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Big number',
        content: insightContent(InsightType.TRENDS),
        viewMode: DashboardTileViewMode.KPI,
        compare: ComparePeriod.PRIOR,
        position: positionFor(18, 9),
      }),
  },
  'daily-active-users': {
    id: 'daily-active-users',
    group: 'suggested',
    displayName: 'Daily active users',
    description: 'Trend line of unique users by day.',
    icon: LineChart,
    // Unique users of the project's most-active event: the same metric the overview
    // page surfaces as its "active users" tile.
    build: ({ bindings }) =>
      create(DashboardTileInputSchema, {
        displayName: 'Daily active users',
        content: insightContent(
          InsightType.TRENDS,
          bindings ? [{ kind: bindings.primary, aggregation: AggregationType.UNIQUE_USERS }] : [],
        ),
        viewMode: DashboardTileViewMode.LINE,
        position: positionFor(36, 18),
      }),
  },
  'signup-activation-funnel': {
    id: 'signup-activation-funnel',
    group: 'suggested',
    displayName: 'Signup → activation funnel',
    description: 'Conversion through ordered steps.',
    icon: BarChart3,
    // Prefer the convention-based shape (signin → primary → conversion); for apps
    // whose events don't match those conventions, fall back to the top events by
    // volume so the funnel still opens with an editable multi-step scaffold.
    build: ({ bindings, topEventKinds }) => {
      const conventional = bindings ? composeFunnelSteps(bindings) : []
      const steps = conventional.length >= 2 ? conventional : topEventKinds.slice(0, 3)
      return create(DashboardTileInputSchema, {
        displayName: 'Funnel',
        content: insightContent(
          InsightType.FUNNEL,
          steps.map(kind => ({ kind })),
        ),
        viewMode: DashboardTileViewMode.LINE,
        position: positionFor(36, 18),
      })
    },
  },
  'day-7-retention': {
    id: 'day-7-retention',
    group: 'suggested',
    displayName: 'Day-7 retention',
    description: 'Cohort retention curve.',
    icon: Repeat,
    // Retention of the most-active event; user can add a distinct return event.
    build: ({ bindings }) =>
      create(DashboardTileInputSchema, {
        displayName: 'Retention',
        content: insightContent(InsightType.RETENTION, bindings ? [{ kind: bindings.primary }] : []),
        viewMode: DashboardTileViewMode.LINE,
        position: positionFor(36, 18),
      }),
  },
  'top-events': {
    id: 'top-events',
    group: 'suggested',
    displayName: 'Top events',
    description: 'Ranked event volume.',
    icon: Trophy,
    // The highest-volume events as a ranked total-count table.
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Top events',
        content: {
          case: 'insight',
          value: create(InsightTileContentSchema, {
            spec: create(InsightQuerySpecSchema, {
              insightType: InsightType.TOP_K,
              topK: create(TopKQuerySchema, {
                dimension: TopKQuery_Dimension.EVENT_KIND,
                metric: AggregationType.TOTAL,
                limit: 10,
              }),
            }),
          }),
        },
        viewMode: DashboardTileViewMode.TABLE,
        position: positionFor(36, 18),
      }),
  },
  revenue: {
    id: 'revenue',
    group: 'suggested',
    displayName: 'Revenue',
    description: 'Sum of amount over time.',
    icon: DollarSign,
    // Only meaningful when the project has a monetization event. Hidden otherwise
    // so non-revenue apps aren't offered a tile that can't be configured.
    isAvailable: ({ bindings }) => !!bindings?.revenueLike,
    // Sum of the `amount` property on the project's revenue event: the shared
    // convention across all well-known monetization events.
    build: ({ bindings }) =>
      create(DashboardTileInputSchema, {
        displayName: 'Revenue',
        content: insightContent(
          InsightType.TRENDS,
          bindings?.revenueLike
            ? [{ kind: bindings.revenueLike, aggregation: AggregationType.SUM, aggregationProperty: 'amount' }]
            : [],
        ),
        viewMode: DashboardTileViewMode.LINE,
        position: positionFor(36, 18),
      }),
  },
  'crawler-requests': {
    id: 'crawler-requests',
    group: 'suggested',
    displayName: 'Crawler requests',
    description: 'Requests from AI and search crawlers, by category.',
    icon: Bot,
    isAvailable: ({ hasCrawlerRequests }) => hasCrawlerRequests,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Crawler requests',
        content: {
          case: 'insight',
          value: create(InsightTileContentSchema, {
            spec: create(InsightQuerySpecSchema, {
              insightType: InsightType.TRENDS,
              events: [
                create(EventQuerySchema, {
                  event: create(EventFilterSchema, { kind: CRAWLER_REQUEST_EVENT }),
                  aggregation: AggregationType.TOTAL,
                }),
              ],
              breakdowns: [create(BreakdownSchema, { property: CRAWLER_CATEGORY_PROPERTY })],
              breakdownLimit: BREAKDOWN_RESPONSE_LIMIT,
              includeBots: true,
            }),
          }),
        },
        viewMode: DashboardTileViewMode.BAR_STACKED,
        position: positionFor(36, 18),
      }),
  },
  'top-crawlers': {
    id: 'top-crawlers',
    group: 'suggested',
    displayName: 'Top crawlers',
    description: 'The crawlers reading your site most.',
    icon: Bot,
    isAvailable: ({ hasCrawlerRequests }) => hasCrawlerRequests,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Top crawlers',
        content: {
          case: 'insight',
          value: create(InsightTileContentSchema, {
            spec: create(InsightQuerySpecSchema, {
              insightType: InsightType.TOP_K,
              topK: create(TopKQuerySchema, {
                dimension: TopKQuery_Dimension.PROPERTY,
                property: CRAWLER_NAME_PROPERTY,
                scope: create(EventFilterSchema, { kind: CRAWLER_REQUEST_EVENT }),
                metric: AggregationType.TOTAL,
                limit: 10,
              }),
              includeBots: true,
            }),
          }),
        },
        viewMode: DashboardTileViewMode.TABLE,
        position: positionFor(36, 18),
      }),
  },
  'text-note': {
    id: 'text-note',
    group: 'blank',
    displayName: 'Text note',
    description: 'Markdown for context or links.',
    icon: FileText,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Note',
        content: {
          case: 'markdown',
          value: create(MarkdownTileContentSchema, { body: '# Note\n\nWrite a short note here.' }),
        },
        position: positionFor(24, 13),
      }),
  },
  'custom-chart': {
    id: 'custom-chart',
    group: 'blank',
    displayName: 'Custom chart',
    description: 'Empty insight to configure from scratch.',
    icon: ListOrdered,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Untitled chart',
        content: insightContent(InsightType.TRENDS),
        viewMode: DashboardTileViewMode.LINE,
        position: positionFor(36, 18),
      }),
  },
}

const TEMPLATE_ORDER: readonly TileTemplateId[] = [
  'kpi-big-number',
  'daily-active-users',
  'signup-activation-funnel',
  'day-7-retention',
  'top-events',
  'revenue',
  'crawler-requests',
  'top-crawlers',
  'text-note',
  'custom-chart',
]

export const TILE_TEMPLATES: readonly TileTemplate[] = TEMPLATE_ORDER.map(id => TILE_TEMPLATES_BY_ID[id])

// Section order + labels for the picker. Each group renders as a flat,
// single-level list (no nested menus, per the light/minimal aesthetic). Labels
// are keyed by TileTemplateGroup so a new group must declare a label (and thus
// can't silently fail to render).
const TEMPLATE_GROUP_LABELS: Record<TileTemplateGroup, string> = {
  suggested: 'Suggested metrics',
  blank: 'Build your own',
}

const TEMPLATE_GROUP_ORDER: readonly TileTemplateGroup[] = ['suggested', 'blank']

export const TEMPLATE_GROUPS: readonly { label: string; group: TileTemplateGroup }[] = TEMPLATE_GROUP_ORDER.map(
  group => ({ label: TEMPLATE_GROUP_LABELS[group], group }),
)
