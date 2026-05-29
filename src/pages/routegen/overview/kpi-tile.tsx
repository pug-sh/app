import { create } from '@bufbuild/protobuf'
import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import {
  ComparePeriod,
  DashboardTileSchema,
  DashboardTileViewMode,
  VisualizationOptionsSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { QueryRequest } from '@/api/genproto/shared/insights/v1/insights_pb'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import type { GlobalOverrides } from './global-overrides'

type Props = GlobalOverrides & {
  title: string
  via: string
  query: QueryRequest
  queryKeyPrefix: string
}

// Overview KPIs aren't real dashboard tiles, but DashboardInsightContent's KPI
// path (big number + delta-vs-prior + sparkline) needs a tile. Hand it this
// shared, immutable render config — compare:PRIOR drives the delta.
const KPI_TILE = create(DashboardTileSchema, {
  viewMode: DashboardTileViewMode.KPI,
  compare: ComparePeriod.PRIOR,
  visualization: create(VisualizationOptionsSchema, { hideSparkline: true }),
})

const KpiTile = ({ title, via, query, globalTimeRange, globalGranularity, queryKeyPrefix }: Props) => (
  <div className="flex h-36 min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background p-4">
    <div className="flex min-w-0 shrink-0 items-start justify-between gap-3">
      <h3 className="truncate text-sm font-semibold">{title}</h3>
    </div>
    <div className="min-h-0 flex-1 pt-2">
      <DashboardInsightContent
        tile={KPI_TILE}
        query={query}
        defaultTimeRange={TimeRangePreset.LAST_30_DAYS}
        timeRangeOverride={globalTimeRange}
        granularityOverride={globalGranularity}
        queryKeyPrefix={queryKeyPrefix}
      />
    </div>
    <p className="mt-2 shrink-0 font-mono text-[10px] text-muted-foreground">via {via}</p>
  </div>
)

export default KpiTile
