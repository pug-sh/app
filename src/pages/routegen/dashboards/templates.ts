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

export type TileTemplate = {
  id: TileTemplateId
  displayName: string
  description: string
  icon: LucideIcon
  build: () => DashboardTileInput
}

// Layouts default to y=0 here; the page shifts new tiles to the bottom of the
// grid before adding to the draft (see appendDraftTile in draft-state.ts).
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

export const TILE_TEMPLATES: TileTemplate[] = [
  {
    id: 'kpi-big-number',
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
  {
    id: 'daily-active-users',
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
  {
    id: 'signup-activation-funnel',
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
  {
    id: 'day-7-retention',
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
  {
    id: 'top-events',
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
  {
    id: 'text-note',
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
  {
    id: 'custom-chart',
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
]

export const findTileTemplate = (id: TileTemplateId): TileTemplate | undefined => TILE_TEMPLATES.find(t => t.id === id)
