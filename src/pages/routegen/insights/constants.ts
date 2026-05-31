import { AggregationType, Granularity, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'

export const GRANULARITIES = [
  { label: 'Hour', value: Granularity.HOUR },
  { label: 'Day', value: Granularity.DAY },
  { label: 'Week', value: Granularity.WEEK },
  { label: 'Month', value: Granularity.MONTH },
] as const

export const GRANULARITY_VALUES = GRANULARITIES.map(x => x.value) as Granularity[]

export const AGGREGATIONS = [
  { label: 'Total events', value: AggregationType.TOTAL },
  { label: 'Unique users', value: AggregationType.UNIQUE_USERS },
  { label: 'Avg per user', value: AggregationType.PER_USER_AVG },
  { label: 'Sum', value: AggregationType.SUM },
  { label: 'Average', value: AggregationType.AVG },
  { label: 'Min', value: AggregationType.MIN },
  { label: 'Max', value: AggregationType.MAX },
] as const

export const NUMERIC_AGGREGATIONS = new Set([
  AggregationType.SUM,
  AggregationType.AVG,
  AggregationType.MIN,
  AggregationType.MAX,
])

export const INSIGHT_TYPES = [
  { label: 'Trends', value: InsightType.TRENDS },
  { label: 'Funnel', value: InsightType.FUNNEL },
  { label: 'Retention', value: InsightType.RETENTION },
  { label: 'User flow', value: InsightType.USER_FLOW },
] as const

export const INSIGHT_TYPE_VALUES = INSIGHT_TYPES.map(x => x.value) as InsightType[]

export type ViewMode = 'line' | 'area' | 'bar-grouped' | 'bar-stacked' | 'table' | 'sankey'
// `sankey` is persisted on dashboard tiles (DashboardTileViewMode.SANKEY). User-flow charts render
// from `resultCase === 'userFlow'`, not from viewMode.

export const VIEW_MODES: readonly { label: string; value: ViewMode }[] = [
  { label: 'Line', value: 'line' },
  { label: 'Area', value: 'area' },
  { label: 'Bar (grouped)', value: 'bar-grouped' },
  { label: 'Bar (stacked)', value: 'bar-stacked' },
  { label: 'Table', value: 'table' },
]

export const EMPTY_RESULT = { case: undefined, value: undefined } as const
export const EMPTY_ARRAY: never[] = []

export const getPageDescription = (insightType: InsightType) => {
  if (insightType === InsightType.TRENDS) return 'Analyze event trends'
  if (insightType === InsightType.RETENTION) return 'Analyze cohort retention over time'
  if (insightType === InsightType.USER_FLOW) return 'Explore how sessions move between events'
  return 'Analyze step-by-step conversion'
}
