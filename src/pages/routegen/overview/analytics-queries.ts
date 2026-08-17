import { create } from '@bufbuild/protobuf'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  BreakdownSchema,
  EventQuerySchema,
  InsightQuerySpecSchema,
  InsightType,
  QueryRequestSchema,
  TopKQuery_Dimension,
  TopKQuerySchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { INCLUDE_COOKIELESS } from './cookieless'

const BREAKDOWN_LIMIT = 50

export const buildTrendsQuery = (kind: string, aggregation: AggregationType) =>
  create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.TRENDS,
      events: [
        create(EventQuerySchema, {
          event: create(EventFilterSchema, { kind }),
          aggregation,
        }),
      ],
      ...INCLUDE_COOKIELESS,
    }),
  })

export const buildTopEventsQuery = () =>
  create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.TOP_K,
      topK: create(TopKQuerySchema, {
        dimension: TopKQuery_Dimension.EVENT_KIND,
        metric: AggregationType.TOTAL,
        limit: 10,
      }),
      ...INCLUDE_COOKIELESS,
    }),
  })

export const buildBreakdownQuery = (kind: string, breakdownProperty: string) =>
  create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.TRENDS,
      events: [
        create(EventQuerySchema, {
          event: create(EventFilterSchema, { kind }),
          // These tiles ask what platform users are on and where they came from — questions about
          // people, so count people rather than occurrences, which would weight by activity and let
          // one busy user outweigh a hundred quiet ones. Per bucket, necessarily: a range-wide
          // unique count isn't recoverable from a trends series (SERIES_COLLAPSE), so the summary
          // reads as an average per bucket.
          aggregation: AggregationType.UNIQUE_USERS,
        }),
      ],
      breakdowns: [create(BreakdownSchema, { property: breakdownProperty })],
      breakdownLimit: BREAKDOWN_LIMIT,
      ...INCLUDE_COOKIELESS,
    }),
  })

// No INCLUDE_COOKIELESS: a rotating id reads as a drop-off at every midnight.
export const buildFunnelQuery = (steps: readonly string[]) =>
  create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.FUNNEL,
      events: steps.map(kind => create(EventQuerySchema, { event: create(EventFilterSchema, { kind }) })),
    }),
  })
