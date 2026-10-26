import { create } from '@bufbuild/protobuf'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  InsightQuerySpecSchema,
  InsightType,
  MapQuerySchema,
  type QueryRequest,
  QueryRequestSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'

export const buildCountryMapQuery = (eventKind: string) =>
  create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.MAP,
      map: create(MapQuerySchema, {
        scope: create(EventFilterSchema, { kind: eventKind }),
        metric: AggregationType.TOTAL,
      }),
    }),
  })

export const activityMapFooter = (query: QueryRequest | undefined) =>
  `via ${query?.spec?.map?.scope?.kind ?? 'event'}, by country`
