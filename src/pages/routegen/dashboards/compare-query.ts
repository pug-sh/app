import { create } from '@bufbuild/protobuf'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { ComparePeriod } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { type QueryRequest, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { toProtoTimeRange } from '@/lib/timestamp'

export const buildComparisonQuery = (
  query: QueryRequest | undefined,
  effectiveTimeRange: TimeRange,
  compare: ComparePeriod,
): QueryRequest | undefined => {
  if (!query) return undefined
  if (compare !== ComparePeriod.PRIOR) return undefined

  const durationMs = Math.max(0, effectiveTimeRange.to.getTime() - effectiveTimeRange.from.getTime())
  if (durationMs <= 0) return undefined

  const priorRange: TimeRange = {
    from: new Date(effectiveTimeRange.from.getTime() - durationMs),
    to: new Date(effectiveTimeRange.from.getTime()),
  }

  return create(QueryRequestSchema, {
    ...query,
    timeRange: create(TimeRangeSchema, toProtoTimeRange(priorRange)),
  })
}

export const formatComparePeriodLabel = (range: TimeRange): string => {
  const days = Math.round((range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 1) return 'vs prior 24h'
  if (days < 14) return `vs prior ${days}d`
  if (days < 60) return `vs prior ${Math.round(days / 7)}w`
  return `vs prior ${Math.round(days / 30)}mo`
}
