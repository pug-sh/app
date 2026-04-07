import { useState } from 'react'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'

export const GRANULARITIES = [
  { label: 'Hour', value: Granularity.HOUR },
  { label: 'Day', value: Granularity.DAY },
  { label: 'Week', value: Granularity.WEEK },
  { label: 'Month', value: Granularity.MONTH },
] as const

const MAX_DAYS: Record<Granularity, number> = {
  [Granularity.UNSPECIFIED]: 0,
  [Granularity.HOUR]: 7,
  [Granularity.DAY]: 90,
  [Granularity.WEEK]: 365,
  [Granularity.MONTH]: Infinity,
}

const MS_PER_DAY = 86_400_000

const rangeDays = (tr: TimeRange) => Math.ceil((tr.to.getTime() - tr.from.getTime()) / MS_PER_DAY)

const fitsRange = (g: Granularity, days: number) => MAX_DAYS[g] >= days

export const useGranularity = (timeRange: TimeRange | undefined, initial = Granularity.DAY) => {
  const [granularity, setGranularity] = useState(initial)

  const days = timeRange ? rangeDays(timeRange) : 0
  const resolvedGranularity = fitsRange(granularity, days)
    ? granularity
    : GRANULARITIES.find(g => fitsRange(g.value, days))?.value ?? Granularity.MONTH

  const options = GRANULARITIES.map(g => ({
    ...g,
    disabled: !fitsRange(g.value, days),
  }))

  return { granularity: resolvedGranularity, setGranularity, options }
}
