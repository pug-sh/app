import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { activityMapFooter, buildCountryBreakdownQuery, resolveActivityMapCountryKey } from '../dashboards/activity-map'
import { ActivityMapView, useActivityMapData } from '../dashboards/activity-map-content'
import type { GlobalOverrides } from './global-overrides'
import { OverviewTileShell } from './overview-tile-shell'

type Props = GlobalOverrides & {
  schema: GetFilterSchemaResponse
  primary: string
}

export function ActivityMapTile({ schema, primary, globalTimeRange, globalGranularity }: Props) {
  const countryKey = resolveActivityMapCountryKey(undefined, schema)
  const query = buildCountryBreakdownQuery(primary, countryKey)
  const {
    countries,
    countryKey: resolvedKey,
    ...viewState
  } = useActivityMapData({
    query,
    countryKey,
    defaultTimeRange: TimeRangePreset.LAST_30_DAYS,
    timeRangeOverride: globalTimeRange,
    granularityOverride: globalGranularity,
    queryKeyPrefix: 'overview-activity-map',
  })

  return (
    <OverviewTileShell
      title="Activity by country"
      footer={activityMapFooter(query, resolvedKey ?? countryKey)}
      meta={
        countries.length > 0 ? (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {countries.length} {countries.length === 1 ? 'country' : 'countries'}
          </span>
        ) : null
      }
      className="h-full"
    >
      <ActivityMapView countries={countries} {...viewState} className="absolute inset-0 min-h-0 overflow-hidden" />
    </OverviewTileShell>
  )
}
