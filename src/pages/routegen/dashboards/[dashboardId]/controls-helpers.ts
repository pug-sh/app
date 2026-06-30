import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import {
  DASHBOARD_TIME_RANGE_PRESETS,
  isDashboardTimeRangePreset,
  resolveDashboardTimeRangePreset,
} from '@/lib/date-presets'
import { GRANULARITIES } from '../../insights/constants'

export const GLOBAL_DASHBOARD_GRANULARITIES = [
  { label: 'Select granularity', value: Granularity.UNSPECIFIED },
  ...GRANULARITIES,
] as const

// Options for the dashboard's saved default range (shown in edit mode). UNSPECIFIED =
// "No default": the dashboard opens with no global override and each tile falls back to
// its own range.
export const DASHBOARD_DEFAULT_RANGE_OPTIONS: readonly { label: string; value: TimeRangePreset }[] = [
  { label: 'No default', value: TimeRangePreset.UNSPECIFIED },
  ...DASHBOARD_TIME_RANGE_PRESETS.map(preset => ({ label: preset.label, value: preset.value })),
]

// Options for the dashboard's saved default granularity (shown in edit mode). UNSPECIFIED =
// "Auto": granularity is derived from the resolved default range when the dashboard opens.
export const DASHBOARD_DEFAULT_GRANULARITIES: readonly { label: string; value: Granularity }[] = [
  { label: 'Auto', value: Granularity.UNSPECIFIED },
  ...GRANULARITIES,
]

// The concrete range a saved default-range preset resolves to, used to cap-gate the
// default-granularity options. Undefined when no default range is set (no cap applies).
export const dashboardDefaultRangePreview = (preset: TimeRangePreset | undefined): TimeRange | undefined =>
  isDashboardTimeRangePreset(preset) ? resolveDashboardTimeRangePreset(preset) : undefined
