import { AggregationType, InsightType, TopKQuery_Dimension } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { EventFilterEntry } from '@/hooks/use-event-filters'
import type { MapState } from './map'
import type { TopKState } from './top-k'

// Mirrors excludeCookielessForAgg: only metrics that count or divide by people consult the flag.
// Total over the enum because the backend's inclusion-list form failed open on a new member.
const COUNTS_PEOPLE = {
  [AggregationType.UNSPECIFIED]: false,
  [AggregationType.TOTAL]: false,
  [AggregationType.UNIQUE_USERS]: true,
  [AggregationType.PER_USER_AVG]: true,
  [AggregationType.SUM]: false,
  [AggregationType.AVG]: false,
  [AggregationType.MIN]: false,
  [AggregationType.MAX]: false,
} as const satisfies Record<AggregationType, boolean>

const PERSON_INSIGHT_TYPES = new Set([InsightType.FUNNEL, InsightType.RETENTION, InsightType.USER_FLOW])

// excludeCookielessForPersons: resolves events per person whatever the measure. A rotating id can
// never recur here, so it reads as drop-off rather than double-counting — the toggle says so.
export const isPersonBasedInsight = (insightType: InsightType, topK: TopKState) =>
  PERSON_INSIGHT_TYPES.has(insightType) ||
  (insightType === InsightType.TOP_K && topK.dimension === TopKQuery_Dimension.USER)

// Whether includeCookieless changes this query's answer. The control is hidden when false: a chip
// that does nothing reads as proof there are no cookieless visitors, the opposite of the truth.
export const cookielessAffectsQuery = ({
  insightType,
  entries,
  topK,
  map,
}: {
  insightType: InsightType
  entries: readonly EventFilterEntry[]
  topK: TopKState
  map: MapState
}) => {
  if (isPersonBasedInsight(insightType, topK)) return true
  if (insightType === InsightType.TOP_K) return COUNTS_PEOPLE[topK.metric]
  if (insightType === InsightType.MAP) return COUNTS_PEOPLE[map.metric]
  return entries.some(entry => COUNTS_PEOPLE[entry.aggregation ?? AggregationType.TOTAL])
}
