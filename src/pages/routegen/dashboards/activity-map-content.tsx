import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import type { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { type Granularity, type QueryRequest, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { ActivityMapView } from '@/components/activity-map-view'
import type { TimeRange } from '@/components/date-range-picker'
import { activeProjectTimezoneAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { stringifyQueryKey, useDebouncedQuery } from '@/hooks/use-debounced-query'
import { resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { alignRangeStart } from '@/lib/granularity'
import { toProtoTimeRange } from '@/lib/timestamp'
import { countryCountsFromTopKRows } from '../insights/map'
import { getInitialGranularity, getProtoRange } from './query'

export type ActivityMapDataProps = {
  query: QueryRequest | undefined
  defaultTimeRange: TimeRangePreset | undefined
  timeRangeOverride?: TimeRange
  granularityOverride?: Granularity
  queryKeyPrefix: string
}

export const useActivityMapData = ({
  query,
  defaultTimeRange,
  timeRangeOverride,
  granularityOverride,
  queryKeyPrefix,
}: ActivityMapDataProps) => {
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const timeZone = useAtomValue(activeProjectTimezoneAtom)

  // Key the memo on the embedded range's *content* (primitive millis), not on `query`'s
  // identity. Callers rebuild `query` inline each render; keying on identity re-ran the
  // preset resolver → new Date() every render, advancing timeRange.to → the stringified
  // queryKey changed → useDebouncedQuery refetched in an infinite loop.
  const embeddedRange = query ? getProtoRange(query.timeRange) : undefined
  const embeddedFromMs = embeddedRange?.from.getTime()
  const embeddedToMs = embeddedRange?.to.getTime()
  const effectiveTimeRange = useMemo(
    () =>
      timeRangeOverride ??
      resolveDashboardTimeRangePreset(
        defaultTimeRange,
        embeddedFromMs !== undefined && embeddedToMs !== undefined
          ? { from: new Date(embeddedFromMs), to: new Date(embeddedToMs) }
          : undefined,
      ),
    [defaultTimeRange, timeRangeOverride, embeddedFromMs, embeddedToMs],
  )
  const effectiveGranularity = useMemo(
    () => granularityOverride ?? getInitialGranularity(query),
    [granularityOverride, query],
  )
  const effectiveQuery = useMemo(() => {
    if (!query) return undefined
    // Aligned the same way as useTrafficQuery / DashboardInsightContent so the map's window matches
    // the sibling tiles' exactly.
    return create(QueryRequestSchema, {
      ...query,
      granularity: effectiveGranularity,
      timeRange: create(
        TimeRangeSchema,
        toProtoTimeRange({
          from: alignRangeStart(effectiveTimeRange, effectiveGranularity, timeZone),
          to: effectiveTimeRange.to,
        }),
      ),
    })
  }, [effectiveGranularity, effectiveTimeRange, query, timeZone])

  const projectId = headers?.['x-project-id'] ?? ''
  const queryKey = stringifyQueryKey({
    prefix: queryKeyPrefix,
    projectId,
    query: effectiveQuery,
  })

  const { data, loading, error, retry } = useDebouncedQuery(
    queryKey,
    async () => {
      if (!effectiveQuery) throw new Error('Missing activity map query')
      const resp = await insightsRPC.query(effectiveQuery, { headers })
      return resp.result
    },
    { enabled: !!effectiveQuery && !!headers, debounceMs: 0 },
  )

  const countries = useMemo(() => (data?.case === 'topK' ? countryCountsFromTopKRows(data.value.rows) : []), [data])

  return {
    countries,
    loading,
    error,
    retry,
    effectiveQuery,
  }
}

export const ActivityMapContent = (props: ActivityMapDataProps) => {
  const state = useActivityMapData(props)
  return <ActivityMapView {...state} className="relative h-full min-h-0 overflow-hidden" />
}
