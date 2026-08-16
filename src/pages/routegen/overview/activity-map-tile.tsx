import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { ActivityMapView } from '@/components/activity-map-view'
import { activityMapFooter, buildCountryMapQuery } from '../dashboards/activity-map'
import { useActivityMapData } from '../dashboards/activity-map-content'
import type { GlobalOverrides } from './global-overrides'
import { OverviewTileShell } from './overview-tile-shell'

type Props = GlobalOverrides & {
  primary: string
}

export function ActivityMapTile({ primary, globalTimeRange, globalGranularity }: Props) {
  const query = buildCountryMapQuery(primary)
  const { countries, ...viewState } = useActivityMapData({
    query,
    defaultTimeRange: TimeRangePreset.LAST_30_DAYS,
    timeRangeOverride: globalTimeRange,
    granularityOverride: globalGranularity,
    queryKeyPrefix: 'overview-activity-map',
  })

  return (
    <OverviewTileShell
      title="Activity by country"
      footer={activityMapFooter(query)}
      meta={
        countries.length > 0 ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
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
