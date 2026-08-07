import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { type Granularity, type QueryRequest, QueryRequestSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import type { TimeRange } from '@/components/date-range-picker'
import { activeProjectTimezoneAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { stringifyQueryKey, useDebouncedQuery } from '@/hooks/use-debounced-query'
import { alignRangeStart } from '@/lib/granularity'
import { toProtoTimeRange } from '@/lib/timestamp'

// Stable sentinel for the not-yet-loaded state, so a consumer's memo/effect deps (e.g. the breakdown
// panel's rows memo, keyed on `result`) don't see a fresh object identity on every in-flight render.
const EMPTY_RESULT = { case: undefined, value: undefined }

// Run a web-analytics query against a concrete window. Mirrors DashboardInsightContent's fetch path
// (project header, zone-bucket flooring, content-keyed debounce) but returns the raw result oneof so
// callers can read the segmentation total / top-k rows / trends series directly — InsightTileView
// renders neither segmentation scalars nor ranked lists, which is why the web view fetches its own.
//
// `baseQuery` must be memoized by the caller (build it from stable primitives): this hook folds the
// window + granularity in and content-keys the debounce, so a stable baseQuery means no refetch loop.
export const useWebQuery = (
  baseQuery: QueryRequest,
  range: TimeRange,
  granularity: Granularity,
  queryKeyPrefix: string,
  // An already-aligned window (the compare-vs-prior period) opts out: re-flooring would push its
  // start back another bucket, making it longer than the window it's compared against.
  align = true,
) => {
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const timeZone = useAtomValue(activeProjectTimezoneAtom)

  const fromMs = range.from.getTime()
  const toMs = range.to.getTime()

  // Floor `from` to the bucket boundary in the project zone, matching the chart's window exactly so a
  // stat total agrees with the series it sits above (and hits the day-aligned rollup fast path).
  const query = useMemo(
    () =>
      create(QueryRequestSchema, {
        ...baseQuery,
        granularity,
        timeRange: create(
          TimeRangeSchema,
          toProtoTimeRange({
            from: align
              ? alignRangeStart({ from: new Date(fromMs), to: new Date(toMs) }, granularity, timeZone)
              : new Date(fromMs),
            to: new Date(toMs),
          }),
        ),
      }),
    [baseQuery, fromMs, toMs, granularity, timeZone, align],
  )

  const projectId = headers?.['x-project-id'] ?? ''
  const queryKey = useMemo(
    () => stringifyQueryKey({ prefix: queryKeyPrefix, projectId, query }),
    [queryKeyPrefix, projectId, query],
  )

  const { data, error, retry, loading } = useDebouncedQuery(
    queryKey,
    async () => {
      const resp = await insightsRPC.query(query, { headers })
      return resp.result
    },
    { enabled: !!headers, debounceMs: 0 },
  )

  return { result: data ?? EMPTY_RESULT, error, retry, loading }
}
