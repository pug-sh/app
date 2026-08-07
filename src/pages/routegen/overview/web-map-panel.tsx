import { useMemo } from 'react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { ActivityMapView, useActivityMapData } from '../dashboards/activity-map-content'
import { OverviewTileShell } from './overview-tile-shell'
import { buildCountryMapQuery, COUNTRY_PROPERTY } from './web-analytics-queries'
import { filtersExcept, filterValues } from './web-filters'

// The choropleth, matching the breakdown panels' shell. Clicking a country cross-filters the page;
// its own $country filter is excluded from the map query so every country stays visible and clickable.
export const WebMapPanel = ({
  range,
  granularity,
  filters,
  onAddFilter,
  queryKeyPrefix,
}: {
  range: TimeRange
  granularity: Granularity
  filters: readonly ActiveFilter[]
  onAddFilter: (property: string, value: string) => void
  queryKeyPrefix: string
}) => {
  const query = useMemo(() => buildCountryMapQuery(filtersExcept(filters, COUNTRY_PROPERTY)), [filters])
  // Excluded from the query above (so all countries stay clickable) but passed to the map to outline
  // the active pick.
  const selectedCountries = useMemo(() => filterValues(filters, COUNTRY_PROPERTY), [filters])
  const { countries, loading, error, retry } = useActivityMapData({
    query,
    countryKey: COUNTRY_PROPERTY,
    defaultTimeRange: undefined,
    timeRangeOverride: range,
    granularityOverride: granularity,
    queryKeyPrefix,
  })

  return (
    // Height follows width so the ~1.41:1 world frame fills the tile at any viewport; capped so
    // ultrawide gets margins rather than a 900px-tall tile.
    <OverviewTileShell
      title="Map"
      footer="pageviews by country"
      className="h-auto w-full aspect-[1.2] max-h-[720px] min-h-[420px]"
    >
      <ActivityMapView
        countries={countries}
        loading={loading}
        error={error}
        retry={retry}
        onCountrySelect={alpha2 => onAddFilter(COUNTRY_PROPERTY, alpha2)}
        selected={selectedCountries}
        className="absolute inset-0 min-h-0 overflow-hidden"
      />
    </OverviewTileShell>
  )
}
