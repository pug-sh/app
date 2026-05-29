import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import {
  activityMapFooter,
  buildCountryBreakdownQuery,
  resolveActivityMapCountryKey,
} from '../dashboards/activity-map'
import { ActivityMapView, useActivityMapData } from '../dashboards/activity-map-content'
import type { GlobalOverrides } from './global-overrides'

// Matches INITIAL_VIEW_BOUNDS in activity-heatmap-map (360° lng / 130° lat).
const MAP_TILE_ASPECT = '360 / 130'

type Props = GlobalOverrides & {
  schema: GetFilterSchemaResponse
  primary: string
}

const ActivityMapTile = ({ schema, primary, globalTimeRange, globalGranularity }: Props) => {
  const countryKey = resolveActivityMapCountryKey(undefined, schema)
  const query = buildCountryBreakdownQuery(primary, countryKey)
  const { countries, countryKey: resolvedKey, ...viewState } = useActivityMapData({
    query,
    countryKey,
    defaultTimeRange: TimeRangePreset.LAST_30_DAYS,
    timeRangeOverride: globalTimeRange,
    granularityOverride: globalGranularity,
    queryKeyPrefix: 'overview-activity-map',
  })

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-border/60 bg-background"
      style={{ aspectRatio: MAP_TILE_ASPECT }}
    >
      <ActivityMapView countries={countries} {...viewState} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-background/90 via-background/50 to-transparent px-4 pb-8 pt-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate text-sm font-semibold">Activity by country</h3>
          {countries.length > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {countries.length} {countries.length === 1 ? 'country' : 'countries'}
            </span>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 z-10 bg-gradient-to-t from-background/90 via-background/50 to-transparent px-4 pb-2 pt-6">
        <p className="font-mono text-[10px] text-muted-foreground">
          {activityMapFooter(query, resolvedKey ?? countryKey)}
        </p>
      </div>
    </div>
  )
}

export default ActivityMapTile
