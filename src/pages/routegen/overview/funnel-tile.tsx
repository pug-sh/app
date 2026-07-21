import { create } from '@bufbuild/protobuf'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  EventQuerySchema,
  InsightQuerySpecSchema,
  InsightType,
  QueryRequestSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import type { GlobalOverrides } from './global-overrides'
import { type Bindings, composeFunnelSteps } from './tile-bindings'

type Props = GlobalOverrides & {
  bindings: Bindings
}

const FunnelTile = ({ bindings, globalTimeRange, globalGranularity }: Props) => {
  const steps = composeFunnelSteps(bindings)
  if (steps.length < 2) return null

  const query = create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.FUNNEL,
      events: steps.map(kind => create(EventQuerySchema, { event: create(EventFilterSchema, { kind }) })),
    }),
  })

  return (
    <div className="flex h-[480px] min-h-0 flex-col rounded-lg border border-border/60 bg-background p-4">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <h3 className="truncate text-lg font-medium tracking-[-0.01em]">Auto funnel</h3>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <DashboardInsightContent
          query={query}
          defaultTimeRange={TimeRangePreset.LAST_30_DAYS}
          timeRangeOverride={globalTimeRange}
          granularityOverride={globalGranularity}
          viewMode={DashboardTileViewMode.UNSPECIFIED}
          queryKeyPrefix="overview-funnel"
          compact
          lightMetrics
        />
      </div>
      <p className="mt-2 shrink-0 text-xs text-faint">via {steps.join(' → ')}</p>
    </div>
  )
}

export default FunnelTile
