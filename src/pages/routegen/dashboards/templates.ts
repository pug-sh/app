import { create } from '@bufbuild/protobuf'
import type { LucideIcon } from 'lucide-react'
import { BarChart3, FileText, Hash, LineChart, ListOrdered, Sparkles, Trophy } from 'lucide-react'
import {
  ComparePeriod,
  type DashboardTileInput,
  DashboardTileInputSchema,
  DashboardTileViewMode,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
  ResponsiveGridLayoutSchema,
  TileHeaderSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightQuerySpecSchema, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'

export type TileTemplateId =
  | 'kpi-big-number'
  | 'daily-active-users'
  | 'signup-activation-funnel'
  | 'day-7-retention'
  | 'top-events'
  | 'text-note'
  | 'custom-chart'

export type TileTemplateGroup = 'suggested' | 'blank'

export type TileTemplate = {
  id: TileTemplateId
  group: TileTemplateGroup
  displayName: string
  description: string
  icon: LucideIcon
  build: () => DashboardTileInput
}

const layoutsFor = (w: number, h: number) =>
  ['lg', 'md', 'sm', 'xs', 'xxs'].map(bp =>
    create(ResponsiveGridLayoutSchema, { breakpoint: bp, x: 0, y: 0, w, h, minW: 2, minH: 4 }),
  )

const insightContent = (insightType: InsightType) => ({
  case: 'insight' as const,
  value: create(InsightTileContentSchema, {
    spec: create(InsightQuerySpecSchema, { insightType }),
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
        header: create(TileHeaderSchema, { accentColor: 'blue' }),
        layouts: layoutsFor(3, 4),
      }),
  },
  'daily-active-users': {
    id: 'daily-active-users',
    group: 'suggested',
    displayName: 'Daily active users',
    description: 'Trend line of unique users by day.',
    icon: LineChart,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Daily active users',
        content: insightContent(InsightType.TRENDS),
        viewMode: DashboardTileViewMode.LINE,
        header: create(TileHeaderSchema, { accentColor: 'blue' }),
        layouts: layoutsFor(6, 8),
      }),
  },
  'signup-activation-funnel': {
    id: 'signup-activation-funnel',
    group: 'suggested',
    displayName: 'Signup → activation funnel',
    description: 'Conversion through ordered steps.',
    icon: BarChart3,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Funnel',
        content: insightContent(InsightType.FUNNEL),
        viewMode: DashboardTileViewMode.LINE,
        header: create(TileHeaderSchema, { accentColor: 'green' }),
        layouts: layoutsFor(6, 8),
      }),
  },
  'day-7-retention': {
    id: 'day-7-retention',
    group: 'suggested',
    displayName: 'Day-7 retention',
    description: 'Cohort retention curve.',
    icon: Sparkles,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Retention',
        content: insightContent(InsightType.RETENTION),
        viewMode: DashboardTileViewMode.LINE,
        header: create(TileHeaderSchema, { accentColor: 'purple' }),
        layouts: layoutsFor(6, 8),
      }),
  },
  'top-events': {
    id: 'top-events',
    group: 'suggested',
    displayName: 'Top events',
    description: 'Ranked event volume table.',
    icon: Trophy,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Top events',
        content: insightContent(InsightType.TRENDS),
        viewMode: DashboardTileViewMode.TABLE,
        header: create(TileHeaderSchema, { accentColor: 'gray' }),
        layouts: layoutsFor(6, 8),
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
        layouts: layoutsFor(4, 6),
      }),
  },
  'custom-chart': {
    id: 'custom-chart',
    group: 'blank',
    displayName: 'Custom chart',
    description: 'Empty insight — configure from scratch.',
    icon: ListOrdered,
    build: () =>
      create(DashboardTileInputSchema, {
        displayName: 'Untitled chart',
        content: insightContent(InsightType.TRENDS),
        viewMode: DashboardTileViewMode.LINE,
        layouts: layoutsFor(6, 8),
      }),
  },
}

const TEMPLATE_ORDER: readonly TileTemplateId[] = [
  'kpi-big-number',
  'daily-active-users',
  'signup-activation-funnel',
  'day-7-retention',
  'top-events',
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

export const findTileTemplate = (id: TileTemplateId): TileTemplate => TILE_TEMPLATES_BY_ID[id]
