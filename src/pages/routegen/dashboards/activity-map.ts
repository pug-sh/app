import { create } from '@bufbuild/protobuf'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  BreakdownSchema,
  EventQuerySchema,
  InsightQuerySpecSchema,
  InsightType,
  type QueryRequest,
  QueryRequestSchema,
  type TrendSeries,
} from '@/api/genproto/shared/insights/v1/insights_pb'
export type CountryActivity = {
  iso: string
  count: number
}

export const COUNTRY_PROPERTY = '$country'
export const COUNTRY_BREAKDOWN_LIMIT = 50

export const resolveCountryPropertyKey = (schema: GetFilterSchemaResponse): string | null => {
  const available = new Set(schema.autoPropertyKeys.map(property => property.name))
  return available.has(COUNTRY_PROPERTY) ? COUNTRY_PROPERTY : null
}

export const resolveCountryBreakdownKey = (query?: QueryRequest): string | null => {
  const breakdowns = query?.spec?.breakdowns ?? []
  const match = breakdowns.find(breakdown => breakdown.property === COUNTRY_PROPERTY)
  return match?.property ?? null
}

export const resolveActivityMapCountryKey = (
  query?: QueryRequest,
  schema?: GetFilterSchemaResponse,
): string =>
  resolveCountryBreakdownKey(query) ?? (schema ? resolveCountryPropertyKey(schema) : null) ?? COUNTRY_PROPERTY

export const isCountryBreakdownQuery = (query?: QueryRequest) => resolveCountryBreakdownKey(query) !== null

export const buildCountryBreakdownQuery = (eventKind: string, countryKey = COUNTRY_PROPERTY) =>
  create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.TRENDS,
      events: [
        create(EventQuerySchema, {
          event: create(EventFilterSchema, { kind: eventKind }),
          aggregation: AggregationType.TOTAL,
        }),
      ],
      breakdowns: [create(BreakdownSchema, { property: countryKey })],
      breakdownLimit: COUNTRY_BREAKDOWN_LIMIT,
    }),
  })

export const countryCountsFromTrendSeries = (series: TrendSeries[], countryKey: string): CountryActivity[] => {
  const counts = new Map<string, number>()

  for (const item of series) {
    const country = item.breakdown[countryKey]
    if (!country) continue
    const total = item.points.reduce((sum, point) => sum + (Number(point.value) || 0), 0)
    if (total <= 0) continue
    const iso = country.toUpperCase()
    counts.set(iso, (counts.get(iso) ?? 0) + total)
  }

  return [...counts.entries()]
    .map(([iso, count]) => ({ iso, count }))
    .sort((a, b) => b.count - a.count || a.iso.localeCompare(b.iso))
}

export const activityMapFooter = (query: QueryRequest | undefined, countryKey: string) => {
  const kind = query?.spec?.events[0]?.event?.kind ?? 'event'
  return `via ${kind}, broken down by ${countryKey}`
}
