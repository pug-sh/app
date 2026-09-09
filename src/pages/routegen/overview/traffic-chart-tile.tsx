import { useState } from 'react'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity, QueryRequest } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import { COMPARE_CAPTION } from '../insights/content'
import { OverviewTileShell } from './overview-tile-shell'

type Props = {
  statLabel: string
  navName: string
  query: QueryRequest
  range: TimeRange
  granularity: Granularity
  queryKeyPrefix: string
}

// Its own component so the compare caption's state flip re-renders this tile alone — held one level
// up it also re-rendered the six stat tiles, both breakdown panels and the MapLibre map beside it.
export const TrafficChartTile = ({ statLabel, navName, query, range, granularity, queryKeyPrefix }: Props) => {
  // The chart reports whether it drew the dashed series; the caption rides the shell's own footer
  // rather than stacking under the chart as a second faint line.
  const [drawsCompare, setDrawsCompare] = useState(false)

  return (
    <OverviewTileShell
      title={statLabel}
      footer={`via ${navName}${drawsCompare ? ` · ${COMPARE_CAPTION.toLowerCase()}` : ''}`}
      contentClassName="flex flex-col"
      className="h-[420px]"
    >
      <div className="min-h-0 flex-1">
        <DashboardInsightContent
          query={query}
          defaultTimeRange={undefined}
          timeRangeOverride={range}
          granularityOverride={granularity}
          viewMode={DashboardTileViewMode.AREA}
          queryKeyPrefix={queryKeyPrefix}
          comparePrior
          onComparisonCaption={setDrawsCompare}
          compact
          lightMetrics
          hideSummary
          seriesLabel={statLabel}
        />
      </div>
    </OverviewTileShell>
  )
}
