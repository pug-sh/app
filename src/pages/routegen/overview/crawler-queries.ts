import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { EventFilterSchema, FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  BreakdownSchema,
  EventQuerySchema,
  type InsightQuerySpecSchema,
  InsightType,
  QueryRequestSchema,
  TopKQuery_Dimension,
  TopKQuerySchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { type ActiveFilter, createFilter } from '@/components/event-filters/filter-model'
import { toProtoFilters } from '@/components/event-filters/filter-proto'
import { CRAWLER_CATEGORY_PROPERTY, CRAWLER_REQUEST_EVENT, STATUS_CODE_PROPERTY } from '@/lib/crawlers'
import { filterGroupFields } from './traffic-filters'

const CRAWLER_LIST_LIMIT = 50

const crawlerQuery = (spec: MessageInitShape<typeof InsightQuerySpecSchema>) =>
  create(QueryRequestSchema, { spec: { ...spec, includeBots: true } })

const crawlerScope = (notFound: boolean) =>
  create(EventFilterSchema, {
    kind: CRAWLER_REQUEST_EVENT,
    filters: notFound
      ? toProtoFilters([createFilter(STATUS_CODE_PROPERTY, PropertySource.AUTO, FilterOperator.EQUALS, '404')])
      : [],
  })

export const buildCrawlerTrendQuery = (filters: readonly ActiveFilter[]) =>
  crawlerQuery({
    insightType: InsightType.TRENDS,
    events: [create(EventQuerySchema, { event: crawlerScope(false), aggregation: AggregationType.TOTAL })],
    breakdowns: [create(BreakdownSchema, { property: CRAWLER_CATEGORY_PROPERTY })],
    breakdownLimit: 10,
    ...filterGroupFields(filters),
  })

export const buildCrawlerTopKQuery = (property: string, filters: readonly ActiveFilter[], notFound = false) =>
  crawlerQuery({
    insightType: InsightType.TOP_K,
    topK: create(TopKQuerySchema, {
      dimension: TopKQuery_Dimension.PROPERTY,
      property,
      scope: crawlerScope(notFound),
      metric: AggregationType.TOTAL,
      limit: CRAWLER_LIST_LIMIT,
    }),
    ...filterGroupFields(filters),
  })
