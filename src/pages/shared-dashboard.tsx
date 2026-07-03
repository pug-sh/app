import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { Clock } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useParams } from 'wouter'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import { SharedDashboardsServiceQueryRequestSchema } from '@/api/genproto/public/dashboards/v1/dashboards_pb'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { sharedDashboardsRPCAtom } from '@/api/rpc'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import LoadingSpinner from '@/components/loading-spinner'
import { stringifyQueryKey, useDebouncedQuery } from '@/hooks/use-debounced-query'
import { INSIGHTS_PRESETS } from '@/lib/date-presets'
import { clampGranularity, clampRange, granularityDisabledReason } from '@/lib/granularity'
import { toProtoTimeRange } from '@/lib/timestamp'
import { GLOBAL_DASHBOARD_GRANULARITIES } from './routegen/dashboards/[dashboardId]/controls-helpers'
import { DashboardGrid } from './routegen/dashboards/grid'
import { SharedTileBody } from './routegen/dashboards/shared-tile-body'
import { DashboardEmptyState } from './routegen/dashboards/tiles'
import { OptionChip } from './routegen/insights/controls'

const Shell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen overflow-auto">
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center gap-3">
        <img src="/logo.svg" alt="" className="size-9" />
        <span className="text-lg font-medium tracking-tight">Pug</span>
      </div>
      {children}
    </div>
  </div>
)

const SharedDashboard = () => {
  const { shareId } = useParams<{ shareId: string }>()
  const sharedRPC = useAtomValue(sharedDashboardsRPCAtom)

  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(undefined)
  const [granularity, setGranularity] = useState(Granularity.UNSPECIFIED)

  // Keep granularity and range within the backend's per-granularity caps so an
  // over-cap pair never reaches SharedDashboardsService.Query (mirrors the authed
  // dashboard header — see src/lib/granularity.ts).
  const handleTimeRangeChange = (range: TimeRange | undefined) => {
    const clamped = clampRange(range)
    setTimeRange(clamped)
    setGranularity(g => clampGranularity(g, clamped))
  }

  const request = useMemo(
    () =>
      create(SharedDashboardsServiceQueryRequestSchema, {
        shareId: shareId ?? '',
        granularity,
        timeRange: timeRange ? create(TimeRangeSchema, toProtoTimeRange(timeRange)) : undefined,
      }),
    [shareId, granularity, timeRange],
  )

  const queryKey = stringifyQueryKey({ shareId, granularity, timeRange })
  const { data, error, loading } = useDebouncedQuery(
    queryKey,
    async () => {
      const resp = await sharedRPC.query(request)
      return resp.dashboard ?? null
    },
    { enabled: !!shareId, debounceMs: 0 },
  )

  // Tiles paired with their pre-rendered results, keyed for the grid's renderTile.
  const { tiles, renderedById } = useMemo(() => {
    const rendered = (data?.tiles ?? []).filter(entry => entry.tile !== undefined)
    return {
      tiles: rendered.map(entry => entry.tile!),
      renderedById: new Map(rendered.map(entry => [entry.tile!.id, entry])),
    }
  }, [data])

  if (loading && !data) {
    return (
      <Shell>
        <LoadingSpinner />
      </Shell>
    )
  }

  if (error || !data) {
    return (
      <Shell>
        <DashboardEmptyState
          title="Dashboard not available"
          description="This link may be invalid or the dashboard is no longer shared."
        />
      </Shell>
    )
  }

  // Chart axes use the user's chosen granularity, falling back to the dashboard's
  // stored default when nothing is selected.
  const resolvedGranularity = granularity === Granularity.UNSPECIFIED ? data.defaultGranularity : granularity

  return (
    <Shell>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-medium tracking-tight">{data.displayName}</h1>
          {data.description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{data.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <DateRangePicker
            value={timeRange}
            onChange={handleTimeRangeChange}
            presets={INSIGHTS_PRESETS}
            allowUnset
            unsetLabel="Select time"
          />
          <OptionChip
            label="granularity"
            icon={Clock}
            options={GLOBAL_DASHBOARD_GRANULARITIES}
            value={granularity}
            onChange={setGranularity}
            isOptionDisabled={v => granularityDisabledReason(v, timeRange)}
          />
        </div>
      </div>

      {tiles.length === 0 ? (
        <DashboardEmptyState title="No tiles yet" description="This dashboard has no tiles to display." />
      ) : (
        <DashboardGrid
          mode="view"
          tiles={tiles}
          renderTile={tile => {
            const rendered = renderedById.get(tile.id)
            if (!rendered) return null
            return <SharedTileBody renderedTile={rendered} granularity={resolvedGranularity} />
          }}
        />
      )}
    </Shell>
  )
}

export default SharedDashboard
