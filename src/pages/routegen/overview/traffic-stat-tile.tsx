import { useMemo } from 'react'
import { type Granularity, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { StatTile } from './stat-tile'
import {
  buildTrafficStatQuery,
  formatTrafficStatValue,
  getTrafficStat,
  type NavEvent,
  type TrafficStatId,
} from './traffic-queries'

export const TrafficStatTile = ({
  statId,
  nav,
  selected,
  onSelect,
  range,
  granularity,
  filters,
}: {
  statId: TrafficStatId
  nav: NavEvent
  selected: boolean
  onSelect: (id: TrafficStatId) => void
  range: TimeRange
  granularity: Granularity
  filters: readonly ActiveFilter[]
}) => {
  const stat = getTrafficStat(statId)
  const scalarQuery = useMemo(
    () => buildTrafficStatQuery(nav.name, statId, InsightType.SEGMENTATION, filters),
    [nav, statId, filters],
  )
  const trendQuery = useMemo(
    () => buildTrafficStatQuery(nav.name, statId, InsightType.TRENDS, filters),
    [nav, statId, filters],
  )

  return (
    <StatTile
      label={stat.label[nav.kind]}
      scalarQuery={scalarQuery}
      trendQuery={trendQuery}
      formatValue={value => formatTrafficStatValue(statId, value)}
      lowerIsBetter={stat.lowerIsBetter}
      selected={selected}
      onSelect={() => onSelect(statId)}
      range={range}
      granularity={granularity}
      queryKeyPrefix={`overview-traffic-stat-${statId}`}
    />
  )
}
