import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { EventFilterSchema, FilterOperator, LogicalOperator } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  BreakdownSchema,
  EventQuerySchema,
  FilterGroupSchema,
  type InsightQuerySpecSchema,
  InsightType,
  QueryRequestSchema,
  SessionMetric,
  SessionQuerySchema,
  TopKQuery_Dimension,
  TopKQuerySchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { type ActiveFilter, createFilter } from '@/components/event-filters/filter-model'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import {
  CRAWLER_CATEGORY_PROPERTY,
  CRAWLER_COMPANY_PROPERTY,
  CRAWLER_NAME_PROPERTY,
  CRAWLER_REQUEST_EVENT,
  CRAWLER_VERIFIED_PROPERTY,
  STATUS_CODE_PROPERTY,
} from '@/lib/crawlers'
import { AI_CHANNEL, AI_REFERRER_DOMAINS, AI_UTM_SOURCES } from './ai-referrers'
import { INCLUDE_COOKIELESS } from './cookieless'
import { filterGroupFields } from './traffic-filters'

export const CRAWLER_PURPOSES = ['answers', 'search', 'training', 'seo'] as const

export type CrawlerPurpose = (typeof CRAWLER_PURPOSES)[number]

const CRAWLER_TABLE_LIMIT = 20
const ERROR_LIMIT = 100
const PAGE_LIMIT = 50

const crawlerQuery = (spec: MessageInitShape<typeof InsightQuerySpecSchema>) =>
  create(QueryRequestSchema, { spec: { ...spec, includeBots: true } })

const crawlerScope = (filters: ActiveFilter[] = []) =>
  create(EventFilterSchema, { kind: CRAWLER_REQUEST_EVENT, filters: toProtoFilters(filters) })

const autoFilter = (property: string, operator: FilterOperator, value: string | string[]) =>
  createFilter(property, PropertySource.AUTO, operator, value)

const purposeIs = (purpose: CrawlerPurpose) => autoFilter(CRAWLER_CATEGORY_PROPERTY, FilterOperator.EQUALS, purpose)
const anError = () => autoFilter(STATUS_CODE_PROPERTY, FilterOperator.GTE, '400')

const requests = (filters: ActiveFilter[] = []) => [
  create(EventQuerySchema, { event: crawlerScope(filters), aggregation: AggregationType.TOTAL }),
]

const breakdowns = (...properties: string[]) => properties.map(property => create(BreakdownSchema, { property }))

export const buildCrawlerPurposeQuery = (
  purpose: CrawlerPurpose,
  insightType: InsightType.SEGMENTATION | InsightType.TRENDS,
  filters: readonly ActiveFilter[],
) => crawlerQuery({ insightType, events: requests([purposeIs(purpose)]), ...filterGroupFields(filters) })

// A crawler has one company and one purpose, so splitting by them too costs no rows and gives each row both.
export const buildCrawlerAgentsQuery = (filters: readonly ActiveFilter[]) =>
  crawlerQuery({
    insightType: InsightType.TRENDS,
    events: requests(),
    breakdowns: breakdowns(CRAWLER_NAME_PROPERTY, CRAWLER_COMPANY_PROPERTY, CRAWLER_CATEGORY_PROPERTY),
    breakdownLimit: CRAWLER_TABLE_LIMIT,
    ...filterGroupFields(filters),
  })

export const buildCrawlerErrorsQuery = (filters: readonly ActiveFilter[]) =>
  crawlerQuery({
    insightType: InsightType.TRENDS,
    events: requests([anError()]),
    breakdowns: breakdowns(CRAWLER_NAME_PROPERTY, STATUS_CODE_PROPERTY),
    breakdownLimit: ERROR_LIMIT,
    ...filterGroupFields(filters),
  })

// Requests that named a crawler but came from outside the addresses its operator publishes.
export const buildCrawlerImpostorsQuery = (filters: readonly ActiveFilter[]) =>
  crawlerQuery({
    insightType: InsightType.TOP_K,
    topK: create(TopKQuerySchema, {
      dimension: TopKQuery_Dimension.PROPERTY,
      property: CRAWLER_NAME_PROPERTY,
      scope: crawlerScope([autoFilter(CRAWLER_VERIFIED_PROPERTY, FilterOperator.EQUALS, 'failed')]),
      metric: AggregationType.TOTAL,
      limit: 3,
      omitOthers: true,
    }),
    ...filterGroupFields(filters),
  })

export const buildCrawlerPagesQuery = (purpose: CrawlerPurpose | undefined, filters: readonly ActiveFilter[]) =>
  crawlerQuery({
    insightType: InsightType.TOP_K,
    topK: create(TopKQuerySchema, {
      dimension: TopKQuery_Dimension.PROPERTY,
      property: '$pathname',
      scope: crawlerScope(purpose ? [purposeIs(purpose)] : []),
      metric: AggregationType.TOTAL,
      limit: PAGE_LIMIT,
    }),
    ...filterGroupFields(filters),
  })

// By page and status, so a row can say which error it got.
export const buildCrawlerProblemsQuery = (filters: readonly ActiveFilter[]) =>
  crawlerQuery({
    insightType: InsightType.TRENDS,
    events: requests([anError()]),
    breakdowns: breakdowns('$pathname', STATUS_CODE_PROPERTY),
    breakdownLimit: PAGE_LIMIT,
    ...filterGroupFields(filters),
  })

// --- Visits from AI ----------------------------------------------------------

const fromAi = () =>
  create(FilterGroupSchema, {
    operator: LogicalOperator.OR,
    filters: toProtoFilters([
      autoFilter('$channel', FilterOperator.EQUALS, AI_CHANNEL),
      autoFilter('$referrerDomain', FilterOperator.IN, AI_REFERRER_DOMAINS),
      autoFilter('$utmSource', FilterOperator.IN, AI_UTM_SOURCES),
    ]),
  })

const visitsQuery = (spec: MessageInitShape<typeof InsightQuerySpecSchema>) =>
  create(QueryRequestSchema, {
    spec: { ...spec, filterGroups: [fromAi()], filterGroupsOperator: LogicalOperator.AND, ...INCLUDE_COOKIELESS },
  })

export const buildAiVisitsQuery = (navEvent: string, insightType: InsightType.SEGMENTATION | InsightType.TRENDS) =>
  visitsQuery({
    insightType,
    session: create(SessionQuerySchema, { metric: SessionMetric.SESSIONS, scope: { kind: navEvent } }),
  })

// Visits by where they started: the AI product that sent them, or the page they landed on.
export const buildAiVisitsBreakdownQuery = (navEvent: string, property: '$referrerDomain' | '$pathname') =>
  visitsQuery({
    insightType: InsightType.TRENDS,
    session: create(SessionQuerySchema, { metric: SessionMetric.ENTRY, scope: { kind: navEvent } }),
    breakdowns: breakdowns(property),
    breakdownLimit: PAGE_LIMIT,
  })
