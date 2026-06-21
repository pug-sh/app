import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { GRANULARITIES } from '../../insights/constants'

export const GLOBAL_DASHBOARD_GRANULARITIES = [
  { label: 'Select granularity', value: Granularity.UNSPECIFIED },
  ...GRANULARITIES,
] as const
