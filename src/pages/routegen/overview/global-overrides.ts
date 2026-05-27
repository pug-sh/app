import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'

// Dashboard-level overrides applied to every chart tile. Time range stays optional
// (unset = the user hasn't picked a window); granularity is undefined when the user
// has left the chip at "Auto" and the parent will derive it from the time range.
export type GlobalOverrides = {
  globalTimeRange: TimeRange | undefined
  globalGranularity: Granularity | undefined
}
