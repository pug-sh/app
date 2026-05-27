import { create } from '@bufbuild/protobuf'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  BreakdownSchema,
  EventQuerySchema,
  InsightQuerySpecSchema,
  InsightType,
  QueryRequestSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import type { GlobalOverrides } from './global-overrides'

// Tried in order. First key present in the project's auto-properties wins.
const OS_PROPERTY_CANDIDATES = ['$osName', '$os', '$osFamily', '$platform']

export const resolveOsPropertyKey = (schema: GetFilterSchemaResponse): string | null => {
  const available = new Set(schema.autoPropertyKeys.map(p => p.name))
  for (const candidate of OS_PROPERTY_CANDIDATES) {
    if (available.has(candidate)) return candidate
  }
  return null
}

type Props = GlobalOverrides & {
  schema: GetFilterSchemaResponse
  primary: string
}

const PlatformTile = ({ schema, primary, globalTimeRange, globalGranularity }: Props) => {
  const osKey = resolveOsPropertyKey(schema)
  if (!osKey) return null

  const query = create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.TRENDS,
      events: [
        create(EventQuerySchema, {
          event: create(EventFilterSchema, { kind: primary }),
          aggregation: AggregationType.TOTAL,
        }),
      ],
      breakdowns: [create(BreakdownSchema, { property: osKey })],
    }),
  })

  return (
    <div className="flex h-[480px] min-h-0 flex-col rounded-lg border border-border/60 bg-background p-4">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <h3 className="truncate text-sm font-semibold">Platform breakdown</h3>
      </div>
      <div className="min-h-0 flex-1">
        <DashboardInsightContent
          query={query}
          defaultTimeRange={TimeRangePreset.LAST_30_DAYS}
          timeRangeOverride={globalTimeRange}
          granularityOverride={globalGranularity}
          viewMode={DashboardTileViewMode.BAR_STACKED}
          queryKeyPrefix="overview-platform"
        />
      </div>
      <p className="mt-2 shrink-0 font-mono text-[10px] text-muted-foreground">
        via {primary}, broken down by {osKey}
      </p>
    </div>
  )
}

export default PlatformTile
