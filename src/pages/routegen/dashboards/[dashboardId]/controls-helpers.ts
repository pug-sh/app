import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { GRANULARITIES } from '../../insights/constants'

export const GLOBAL_DASHBOARD_GRANULARITIES = [
  { label: 'Select granularity', value: Granularity.UNSPECIFIED },
  ...GRANULARITIES,
] as const

const DAY_MS = 24 * 60 * 60 * 1000

// Derive a sensible bucket size from the selected window so the dashboard's
// global granularity defaults reasonably; the user can still override it.
export const getAutoGlobalGranularity = (range: TimeRange | undefined) => {
  if (!range) return Granularity.UNSPECIFIED

  const durationMs = Math.max(0, range.to.getTime() - range.from.getTime())
  if (durationMs <= DAY_MS) return Granularity.HOUR
  if (durationMs <= 90 * DAY_MS) return Granularity.DAY
  if (durationMs <= 365 * DAY_MS) return Granularity.WEEK
  return Granularity.MONTH
}
