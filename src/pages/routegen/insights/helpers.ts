import type { FunnelSeries, TrendSeries } from '@/api/genproto/shared/insights/v1/insights_pb'
import { tsToDate } from '@/lib/timestamp'

type ChartPoint = {
  date: Date
  values: number[]
}

export const sortFunnelSteps = (steps: FunnelSeries['steps'], kindOrder: string[]) => {
  const byKind = new Map(steps.map(s => [s.eventKind, Number(s.total) || 0]))
  return kindOrder.map((kind, i) => ({ name: kind || `Step ${i + 1}`, count: byKind.get(kind) ?? 0 }))
}

// Shown wherever a property value is empty — an event carrying no $utmSource, no $os,
// and so on. The backend counts those events as a real bucket rather than dropping them,
// in breakdowns and in top-k alike, so both render this. Deliberately generic: the
// property decides what "empty" means, and one label serves every key. Resist naming it
// for one property's story — "(direct)" would be wrong even for $utmSource, whose empty
// bucket is every untagged visit (app sessions, organic search, untagged referrals),
// not the referrer-derived direct traffic that name implies.
export const EMPTY_VALUE_LABEL = '(none)'

// A series with no breakdown keys is unsplit: the backend returns exactly one such
// series when the request asked for no breakdown. That is distinct from a requested
// breakdown that resolved to an empty value, which is a real bucket and must not be
// mistaken for the unsplit total.
export const hasBreakdown = (breakdown: Record<string, string>) => Object.keys(breakdown).length > 0

export const breakdownLabel = (breakdown: Record<string, string>, fallback: string) => {
  if (!hasBreakdown(breakdown)) return fallback
  return Object.values(breakdown)
    .map(value => value || EMPTY_VALUE_LABEL)
    .join(' / ')
}

export const disambiguateLabels = (labels: string[]) => {
  const seen = new Map<string, number>()
  return labels.map(label => {
    const count = (seen.get(label) ?? 0) + 1
    seen.set(label, count)
    return count > 1 ? `${label} (${count})` : label
  })
}

export const buildChartData = (trendSeries: TrendSeries[]): ChartPoint[] => {
  if (trendSeries.length === 0) return []

  return trendSeries[0].points
    .map((p, i) => {
      const date = tsToDate(p.time)
      if (!date) return null
      return {
        date,
        values: trendSeries.map(s => Number(s.points[i]?.value) || 0),
      }
    })
    .filter((d): d is ChartPoint => d !== null)
}
