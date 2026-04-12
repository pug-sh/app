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
  [Granularity.UNSPECIFIED]: -1,
  [Granularity.HOUR]: 7,
  [Granularity.DAY]: 90,
  [Granularity.WEEK]: 365,
  [Granularity.MONTH]: Infinity,
}

const MS_PER_DAY = 86_400_000

const rangeDays = (tr: TimeRange) => Math.max(0, Math.ceil((tr.to.getTime() - tr.from.getTime()) / MS_PER_DAY))

const fitsRange = (g: Granularity, days: number) => MAX_DAYS[g] >= days

export const useGranularity = (timeRange: TimeRange | undefined, initial = Granularity.DAY) => {
  const [selected, setSelected] = useState(initial)
  const days = timeRange ? rangeDays(timeRange) : 0

  // Derive the effective granularity — `selected` preserves user intent,
  // so their original choice is restored when the range fits again.
  const granularity = fitsRange(selected, days)
    ? selected
    : GRANULARITIES.find(g => fitsRange(g.value, days))?.value ?? Granularity.MONTH

  const options = GRANULARITIES.map(g => {
    const disabled = !fitsRange(g.value, days)
    return { ...g, disabled, title: disabled ? 'Not available for this time range' : undefined }
  })

  return { granularity, setGranularity: setSelected, options }
}
