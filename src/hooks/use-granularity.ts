import { useState } from 'react'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'

export const GRANULARITIES = [
  { label: 'Hour', value: Granularity.HOUR },
  { label: 'Day', value: Granularity.DAY },
  { label: 'Week', value: Granularity.WEEK },
  { label: 'Month', value: Granularity.MONTH },
] as const

const GRANULARITY_MAX_DAYS: Record<Granularity, number> = {
  [Granularity.UNSPECIFIED]: 0,
  [Granularity.HOUR]: 7,
  [Granularity.DAY]: 90,
  [Granularity.WEEK]: 365,
  [Granularity.MONTH]: Infinity,
}

const rangeDays = (tr: TimeRange) => Math.ceil((tr.to.getTime() - tr.from.getTime()) / 86_400_000)

const coarsestValidGranularity = (days: number): Granularity =>
  GRANULARITIES.find(g => GRANULARITY_MAX_DAYS[g.value] >= days)?.value ?? Granularity.MONTH

export const useGranularity = (timeRange: TimeRange | undefined, initial = Granularity.DAY) => {
  const [granularity, setGranularity] = useState(initial)

  const days = timeRange ? rangeDays(timeRange) : 0
  const resolvedGranularity = GRANULARITY_MAX_DAYS[granularity] < days
    ? coarsestValidGranularity(days)
    : granularity

  const options = GRANULARITIES.map(g => ({
    ...g,
    disabled: !!timeRange && GRANULARITY_MAX_DAYS[g.value] < days,
  }))

  return { granularity: resolvedGranularity, setGranularity, options }
}
