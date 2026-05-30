import { create } from '@bufbuild/protobuf'
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
import { OverviewTileShell } from './overview-tile-shell'

const BREAKDOWN_LIMIT = 50

type Props = GlobalOverrides & {
  title: string
  // The event to count (usually the project's primary kind).
  eventKind: string
  // Auto-property key to break the event down by, e.g. '$os' or '$utmSource'.
  // Passed literally rather than resolved from schema.autoPropertyKeys: that rollup
  // is sparse and omits many keys events actually carry, whereas the Query RPC reads
  // raw events and always honors the breakdown. Forcing the key here is what keeps the
  // tile from silently disappearing — the same approach the activity map uses for $country.
  breakdownProperty: string
  queryKeyPrefix: string
  viewMode?: DashboardTileViewMode
}

const BreakdownTile = ({
  title,
  eventKind,
  breakdownProperty,
  queryKeyPrefix,
  viewMode = DashboardTileViewMode.BAR_STACKED,
  globalTimeRange,
  globalGranularity,
}: Props) => {
  const query = create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.TRENDS,
      events: [
        create(EventQuerySchema, {
          event: create(EventFilterSchema, { kind: eventKind }),
          aggregation: AggregationType.TOTAL,
        }),
      ],
      breakdowns: [create(BreakdownSchema, { property: breakdownProperty })],
      breakdownLimit: BREAKDOWN_LIMIT,
    }),
  })

  return (
    <OverviewTileShell
      title={title}
      footer={`via ${eventKind}, broken down by ${breakdownProperty}`}
      contentClassName="flex flex-col"
      className="h-[480px]"
    >
      <div className="min-h-0 flex-1">
        <DashboardInsightContent
          query={query}
          defaultTimeRange={TimeRangePreset.LAST_30_DAYS}
          timeRangeOverride={globalTimeRange}
          granularityOverride={globalGranularity}
          viewMode={viewMode}
          queryKeyPrefix={queryKeyPrefix}
          compact
        />
      </div>
    </OverviewTileShell>
  )
}

export default BreakdownTile
