import { create } from '@bufbuild/protobuf'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { type Granularity, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { resolveActivityMapCountryKey } from './activity-map'
import { ActivityMapContent } from './activity-map-content'

type Props = {
  tile: DashboardTile
  globalTimeRange?: TimeRange
  globalGranularity?: Granularity
}

/** Drop-in map body for dashboard tiles. Wrap with TileShell in tiles.tsx. */
export const DashboardActivityMapTileBody = ({ tile, globalTimeRange, globalGranularity }: Props) => {
  const spec = tile.content.case === 'insight' ? tile.content.value.spec : undefined
  const query = spec ? create(QueryRequestSchema, { spec }) : undefined
  const countryKey = resolveActivityMapCountryKey(query)

  return (
    <ActivityMapContent
      query={query}
      countryKey={countryKey}
      defaultTimeRange={undefined}
      timeRangeOverride={globalTimeRange}
      granularityOverride={globalGranularity}
      queryKeyPrefix={tile.id}
    />
  )
}
