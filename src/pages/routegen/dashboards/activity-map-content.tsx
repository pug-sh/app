import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { Globe, Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import type { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { type Granularity, type QueryRequest, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import ActivityHeatmapMap from '@/components/activity-heatmap-map'
import type { TimeRange } from '@/components/date-range-picker'
import { Button } from '@/components/ui/button'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { useDebouncedQuery } from '@/hooks/use-debounced-query'
import { resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { toProtoTimeRange } from '@/lib/timestamp'
import { countryCountsFromTrendSeries } from './activity-map'
import { getInitialGranularity, getProtoRange } from './query'

const stringifyQueryKey = (value: unknown) =>
  JSON.stringify(value, (_key, nextValue) => (typeof nextValue === 'bigint' ? nextValue.toString() : nextValue))

export type ActivityMapDataProps = {
  query: QueryRequest | undefined
  countryKey: string | null | undefined
  defaultTimeRange: TimeRangePreset | undefined
  timeRangeOverride?: TimeRange
  granularityOverride?: Granularity
  queryKeyPrefix: string
}

export const useActivityMapData = ({
  query,
  countryKey,
  defaultTimeRange,
  timeRangeOverride,
  granularityOverride,
  queryKeyPrefix,
}: ActivityMapDataProps) => {
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)

  const effectiveTimeRange = useMemo(
    () =>
      timeRangeOverride ??
      resolveDashboardTimeRangePreset(defaultTimeRange, query ? getProtoRange(query.timeRange) : undefined),
    [defaultTimeRange, query, timeRangeOverride],
  )
  const effectiveGranularity = useMemo(
    () => granularityOverride ?? getInitialGranularity(query),
    [granularityOverride, query],
  )
  const effectiveQuery = useMemo(() => {
    if (!query || !countryKey) return undefined
    return create(QueryRequestSchema, {
      ...query,
      granularity: effectiveGranularity,
      timeRange: create(TimeRangeSchema, toProtoTimeRange(effectiveTimeRange)),
    })
  }, [countryKey, effectiveGranularity, effectiveTimeRange, query])

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
    { enabled: !!effectiveQuery && !!headers && !!countryKey, debounceMs: 0 },
  )

  const countries =
    data?.case === 'trends' && countryKey ? countryCountsFromTrendSeries([...data.value.series], countryKey) : []

  return {
    countries,
    loading,
    error,
    retry,
    countryKey,
    effectiveQuery,
  }
}

type ActivityMapViewProps = {
  countries: ReturnType<typeof useActivityMapData>['countries']
  loading: boolean
  error: string | null
  retry: () => void
  className?: string
}

export const ActivityMapView = ({ countries, loading, error, retry, className }: ActivityMapViewProps) => {
  const stateClass = className ?? 'absolute inset-0'

  if (loading && countries.length === 0) {
    return (
      <div className={`${stateClass} flex items-center justify-center bg-muted/20`}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${stateClass} flex flex-col items-center justify-center gap-2 bg-muted/20 text-center`}>
        <Globe className="size-8 opacity-15" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => retry()}>
          Retry
        </Button>
      </div>
    )
  }

  if (countries.length === 0) {
    return (
      <div className={`${stateClass} flex flex-col items-center justify-center bg-muted/20 text-center`}>
        <Globe className="mb-3 size-8 opacity-15" />
        <p className="text-sm font-medium">No location data yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Events need a country to appear on the map</p>
      </div>
    )
  }

  return (
    <div className={stateClass}>
      <ActivityHeatmapMap countries={countries} />
    </div>
  )
}

export const ActivityMapContent = (props: ActivityMapDataProps) => {
  const state = useActivityMapData(props)
  return <ActivityMapView {...state} className="relative h-full min-h-0" />
}
