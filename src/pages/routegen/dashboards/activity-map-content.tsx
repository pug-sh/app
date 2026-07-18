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
import { activeProjectTimezoneAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { stringifyQueryKey, useDebouncedQuery } from '@/hooks/use-debounced-query'
import { resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { toProtoTimeRange } from '@/lib/timestamp'
import { floorToZoneBucket } from '@/lib/timezone'
import { countryCountsFromTrendSeries } from './activity-map'
import { getInitialGranularity, getProtoRange } from './query'

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
    if (!query || !countryKey) return undefined
    // Floor `from` to the bucket boundary in the project zone (as useWebQuery / DashboardInsightContent
    // do) so the map's window matches the sibling tiles' exactly and its first bucket is whole.
    return create(QueryRequestSchema, {
      ...query,
      granularity: effectiveGranularity,
      timeRange: create(
        TimeRangeSchema,
        toProtoTimeRange({
          from: floorToZoneBucket(effectiveTimeRange.from, effectiveGranularity, timeZone),
          to: effectiveTimeRange.to,
        }),
      ),
    })
  }, [countryKey, effectiveGranularity, effectiveTimeRange, query, timeZone])

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

  const countries = useMemo(
    () =>
      data?.case === 'trends' && countryKey ? countryCountsFromTrendSeries([...data.value.series], countryKey) : [],
    [countryKey, data],
  )

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
  onCountrySelect?: (alpha2: string) => void
  selected?: readonly string[]
}

export const ActivityMapView = ({
  countries,
  loading,
  error,
  retry,
  className,
  onCountrySelect,
  selected,
}: ActivityMapViewProps) => {
  const stateClass = className ?? 'absolute inset-0'

  if (loading && countries.length === 0) {
    return (
      <div className={`${stateClass} flex items-center justify-center`}>
        <Loader2 className="size-4 animate-spin text-muted-foreground/70" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${stateClass} flex flex-col items-center justify-center gap-2 text-center`}>
        <Globe className="size-7 opacity-15" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => retry()}>
          Retry
        </Button>
      </div>
    )
  }

  if (countries.length === 0) {
    return (
      <div className={`${stateClass} flex flex-col items-center justify-center text-center`}>
        <Globe className="mb-2 size-7 opacity-15" />
        <p className="text-sm text-muted-foreground">No location data yet</p>
      </div>
    )
  }

  return (
    <div className={stateClass}>
      <ActivityHeatmapMap countries={countries} onCountrySelect={onCountrySelect} selected={selected} />
    </div>
  )
}

export const ActivityMapContent = (props: ActivityMapDataProps) => {
  const state = useActivityMapData(props)
  return <ActivityMapView {...state} className="relative h-full min-h-0 overflow-hidden" />
}
