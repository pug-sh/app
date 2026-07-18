import { create } from '@bufbuild/protobuf'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { ComparePeriod } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { type QueryRequest, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { toProtoTimeRange } from '@/lib/timestamp'

// The immediately-preceding window of equal length. Shared by the KPI compare-vs-prior query and the
// web-analytics stat tiles so both derive the comparison window identically.
export const priorPeriodRange = (range: TimeRange): TimeRange => {
  const durationMs = Math.max(0, range.to.getTime() - range.from.getTime())
  return { from: new Date(range.from.getTime() - durationMs), to: new Date(range.from.getTime()) }
}

export const buildComparisonQuery = (
  query: QueryRequest | undefined,
  effectiveTimeRange: TimeRange,
  compare: ComparePeriod,
): QueryRequest | undefined => {
  if (!query) return undefined
  if (compare !== ComparePeriod.PRIOR) return undefined
  // A zero/negative-length window has no meaningful prior period.
  if (effectiveTimeRange.to.getTime() <= effectiveTimeRange.from.getTime()) return undefined

  return create(QueryRequestSchema, {
    ...query,
    timeRange: create(TimeRangeSchema, toProtoTimeRange(priorPeriodRange(effectiveTimeRange))),
  })
}

export const formatComparePeriodLabel = (range: TimeRange): string => {
  const days = Math.round((range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 1) return 'vs prior 24h'
  if (days < 14) return `vs prior ${days}d`
  if (days < 60) return `vs prior ${Math.round(days / 7)}w`
  return `vs prior ${Math.round(days / 30)}mo`
}
