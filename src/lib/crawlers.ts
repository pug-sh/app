import { create, type JsonObject, type MessageInitShape } from '@bufbuild/protobuf'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { EventFilterSchema, FilterOperator, type PropertyFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import type { InsightQuerySpecSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import { structGet } from './struct'

// Requests a site's server reports through @pug-sh/crawlers. Ingest tags every one as a bot, under a
// reserved `crawler-<agent>` id with one session per agent per UTC day.
export const CRAWLER_REQUEST_EVENT = 'crawler_request'

const CRAWLER_ID_PREFIX = 'crawler-'

export const isCrawlerId = (distinctId: string) => distinctId.startsWith(CRAWLER_ID_PREFIX)

// A crawler request's agent name (GPTBot); other bot-tagged events hold their detection reason (asn:<n>).
export const CRAWLER_NAME_PROPERTY = '$bot_reason'
export const CRAWLER_COMPANY_PROPERTY = '$crawler_company'
export const CRAWLER_CATEGORY_PROPERTY = '$crawler_category'
export const CRAWLER_VERIFIED_PROPERTY = '$crawler_verified'
export const STATUS_CODE_PROPERTY = '$status_code'

// A failed IP check means the name can't be trusted, so the request counts as no crawler.
export const crawlerRequestScope = (filters: MessageInitShape<typeof PropertyFilterSchema>[] = []) =>
  create(EventFilterSchema, {
    kind: CRAWLER_REQUEST_EVENT,
    filters: [
      {
        property: CRAWLER_VERIFIED_PROPERTY,
        source: PropertySource.AUTO,
        operator: FilterOperator.NOT_EQUALS,
        value: 'failed',
      },
      ...filters,
    ],
  })

// Search engines and SEO tools from the crawler-user-agents list carry no company.
export const crawlerOf = (auto: JsonObject | undefined) => ({
  name: structGet(auto, CRAWLER_NAME_PROPERTY) || 'Crawler',
  company: structGet(auto, CRAWLER_COMPANY_PROPERTY) || undefined,
  category: structGet(auto, CRAWLER_CATEGORY_PROPERTY) || undefined,
  verified: structGet(auto, CRAWLER_VERIFIED_PROPERTY) || undefined,
})

export type CrawlerIdentity = ReturnType<typeof crawlerOf>

// Only bot-tagged rows carry this kind and these properties, so a query on them needs bots included.
const isBotOnlyProperty = (property?: string) =>
  !!property && (property === '$bot' || property === CRAWLER_NAME_PROPERTY || property.startsWith('$crawler_'))

// A negation also matches every row without the property, which is mostly people.
const NEGATIONS: ReadonlySet<FilterOperator | undefined> = new Set([
  FilterOperator.NOT_EQUALS,
  FilterOperator.NOT_CONTAINS,
  FilterOperator.NOT_IN,
  FilterOperator.IS_NOT_SET,
])

type Filter = { property?: string; operator?: FilterOperator }

export const readsBotOnlyData = (
  kinds: readonly (string | undefined)[],
  filters: readonly Filter[],
  dimensions: readonly (string | undefined)[] = [],
) =>
  kinds.includes(CRAWLER_REQUEST_EVENT) ||
  dimensions.some(isBotOnlyProperty) ||
  filters.some(filter => isBotOnlyProperty(filter.property) && !NEGATIONS.has(filter.operator))

export const specReadsBotOnlyData = (spec: MessageInitShape<typeof InsightQuerySpecSchema>) => {
  const scopes = [
    ...(spec.events ?? []).map(entry => entry.event),
    spec.topK?.scope,
    spec.map?.scope,
    spec.userFlow?.scope,
    spec.session?.scope,
  ]
  return readsBotOnlyData(
    scopes.map(scope => scope?.kind),
    [
      ...scopes.flatMap(scope => scope?.filters ?? []),
      ...(spec.filterGroups ?? []).flatMap(group => group.filters ?? []),
    ],
    [...(spec.breakdowns ?? []).map(breakdown => breakdown.property), spec.topK?.property, spec.userFlow?.nodeProperty],
  )
}
