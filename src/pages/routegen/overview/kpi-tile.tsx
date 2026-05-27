import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { QueryRequest } from '@/api/genproto/shared/insights/v1/insights_pb'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import type { GlobalOverrides } from './global-overrides'

type Props = GlobalOverrides & {
  title: string
  via: string
  query: QueryRequest
  queryKeyPrefix: string
}

const KpiTile = ({ title, via, query, globalTimeRange, globalGranularity, queryKeyPrefix }: Props) => (
  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background p-4">
    <div className="flex min-w-0 shrink-0 items-start justify-between gap-3">
      <h3 className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
    </div>
    <div className="min-h-0 flex-1 pt-2">
      <DashboardInsightContent
        query={query}
        defaultTimeRange={TimeRangePreset.LAST_30_DAYS}
        timeRangeOverride={globalTimeRange}
        granularityOverride={globalGranularity}
        viewMode={DashboardTileViewMode.LINE}
        queryKeyPrefix={queryKeyPrefix}
        compact
      />
    </div>
    <p className="mt-2 shrink-0 font-mono text-[10px] text-muted-foreground">via {via}</p>
  </div>
)

export default KpiTile
