import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { Edit3, FileText, MoreHorizontal, Trash2, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  Granularity,
  InsightType,
  QueryRequestSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import type { TimeRange } from '@/components/date-range-picker'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { useDebouncedQuery } from '@/hooks/use-debounced-query'
import { getSeriesColor } from '@/lib/event-colors'
import { toProtoTimeRange } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { NUMERIC_AGGREGATIONS, VIEW_MODES, type ViewMode } from '../insights/constants'
import { InsightsContent } from '../insights/content'
import { breakdownLabel, buildChartData, disambiguateLabels, sortFunnelSteps } from '../insights/helpers'
import { BREAKDOWN_RESPONSE_LIMIT } from './constants'

const getTileKindIcon = (tile: DashboardTile) => {
  if (tile.content.case === 'markdown') return FileText
  return TrendingUp
}

const TileShell = ({ tile, children }: { tile: DashboardTile; children: React.ReactNode }) => {
  const Icon = getTileKindIcon(tile)

  return (
    <div className="group h-full rounded-xl border border-border/60 bg-background p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1 pr-8">
          <h3 className="truncate text-sm font-semibold">{tile.displayName}</h3>
          {tile.description ? <p className="mt-1 text-xs text-muted-foreground">{tile.description}</p> : null}
        </div>
      </div>
      <div className="min-h-0">{children}</div>
    </div>
  )
}

const DashboardMarkdownTile = ({ tile }: { tile: DashboardTile }) => {
  if (tile.content.case !== 'markdown') return null

  return (
    <TileShell tile={tile}>
      <div className="markdown-body text-sm leading-6 text-foreground">
        <ReactMarkdown
          components={{
            h1: props => <h1 className="mb-2 text-lg font-semibold" {...props} />,
            h2: props => <h2 className="mb-2 text-base font-semibold" {...props} />,
            h3: props => <h3 className="mb-2 text-sm font-semibold" {...props} />,
            p: props => <p className="mb-3 last:mb-0" {...props} />,
            ul: props => <ul className="mb-3 list-disc pl-5 last:mb-0" {...props} />,
            ol: props => <ol className="mb-3 list-decimal pl-5 last:mb-0" {...props} />,
            li: props => <li className="mb-1" {...props} />,
            code: props => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...props} />,
            pre: props => <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs" {...props} />,
            a: props => <a className="text-primary hover:underline underline-offset-4" {...props} />,
            blockquote: props => (
              <blockquote className="border-l-2 border-border pl-3 text-muted-foreground" {...props} />
            ),
          }}
        >
          {tile.content.value.body}
        </ReactMarkdown>
      </div>
    </TileShell>
  )
}

const DashboardInsightTile = ({ tile, timeRange }: { tile: DashboardTile; timeRange: TimeRange | undefined }) => {
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const query = tile.content.case === 'insight' ? tile.content.value.query : undefined

  const effectiveQuery = useMemo(() => {
    if (!query) return undefined
    if (!timeRange) return query
    return create(QueryRequestSchema, {
      ...query,
      timeRange: create(TimeRangeSchema, toProtoTimeRange(timeRange)),
    })
  }, [query, timeRange])

  const queryKey = JSON.stringify({
    tileId: tile.id,
    query: effectiveQuery,
    projectId: headers?.['x-project-id'] ?? '',
  })
  const { data, error, retry } = useDebouncedQuery(
    queryKey,
    async () => {
      if (!effectiveQuery) throw new Error('Missing tile query')
      const resp = await insightsRPC.query(effectiveQuery, { headers })
      return resp.result
    },
    { enabled: !!effectiveQuery && !!headers && (effectiveQuery?.events.length ?? 0) > 0, debounceMs: 0 },
  )

  const result = data ?? { case: undefined, value: undefined }
  const trendSeries = useMemo(() => (result.case === 'trends' ? [...result.value.series] : []), [result])
  const funnelSeriesList = useMemo(() => (result.case === 'funnel' ? result.value.series : []), [result])
  const retentionSeriesList = useMemo(() => (result.case === 'retention' ? result.value.series : []), [result])
  const chartData = useMemo(() => buildChartData(trendSeries), [trendSeries])
  const kindOrder = useMemo(
    () => (effectiveQuery?.events ?? []).map(entry => entry.event?.kind ?? ''),
    [effectiveQuery?.events],
  )
  const funnelSeriesData = useMemo(() => {
    const labels = disambiguateLabels(
      funnelSeriesList.map((series, index) => breakdownLabel(series.breakdown, `Series ${index + 1}`)),
    )
    return funnelSeriesList.map((series, index) => ({
      label: labels[index],
      steps: sortFunnelSteps(series.steps, kindOrder),
      color: getSeriesColor(labels[index], index).dot,
    }))
  }, [funnelSeriesList, kindOrder])
  const retentionLabels = useMemo(
    () =>
      disambiguateLabels(
        retentionSeriesList.map((series, index) => breakdownLabel(series.breakdown, `Series ${index + 1}`)),
      ),
    [retentionSeriesList],
  )
  const retentionCohorts = useMemo(() => retentionSeriesList[0]?.cohorts ?? [], [retentionSeriesList])
  const isTrends = effectiveQuery?.insightType === InsightType.TRENDS
  const isRetention = effectiveQuery?.insightType === InsightType.RETENTION
  const seriesNames = useMemo(() => {
    if (result.case === 'retention') {
      return retentionCohorts.map((cohort, index) => cohort.cohort || `Cohort ${index + 1}`)
    }

    return trendSeries.map((series, index) => {
      const bd = breakdownLabel(series.breakdown, '')
      if (bd) return `${series.eventKind} · ${bd}`
      return series.eventKind || `Series ${index + 1}`
    })
  }, [result.case, retentionCohorts, trendSeries])
  const seriesColors = useMemo(() => seriesNames.map((name, index) => getSeriesColor(name, index)), [seriesNames])
  const seriesAggregations = useMemo(
    () => (effectiveQuery?.events ?? []).map(entry => entry.aggregation ?? AggregationType.TOTAL),
    [effectiveQuery?.events],
  )
  const hasIncompleteNumericAggregation = useMemo(
    () =>
      (effectiveQuery?.events ?? []).some(
        entry =>
          NUMERIC_AGGREGATIONS.has(entry.aggregation ?? AggregationType.TOTAL) &&
          !(entry.aggregationProperty ?? '').trim(),
      ),
    [effectiveQuery?.events],
  )

  return (
    <TileShell tile={tile}>
      <InsightsContent
        error={error}
        retry={retry}
        unknownResultCase={!!result.case && !['trends', 'funnel', 'retention'].includes(result.case)}
        resultCase={result.case}
        resultSeriesCount={
          result.case === 'trends' || result.case === 'funnel' || result.case === 'retention'
            ? result.value.series.length
            : 0
        }
        isRetention={isRetention}
        isTrends={isTrends}
        hasIncompleteNumericAggregation={hasIncompleteNumericAggregation}
        chartData={chartData}
        seriesNames={seriesNames}
        seriesColors={seriesColors}
        seriesAggregations={seriesAggregations}
        viewMode={VIEW_MODES[0]?.value ?? ('line' as ViewMode)}
        granularity={effectiveQuery?.granularity ?? Granularity.DAY}
        breakdowns={(effectiveQuery?.breakdowns ?? []).map(item => item.property)}
        breakdownResponseLimit={effectiveQuery?.breakdownLimit ?? BREAKDOWN_RESPONSE_LIMIT}
        retentionSeriesList={retentionSeriesList}
        retentionLabels={retentionLabels}
        retentionCohorts={retentionCohorts}
        funnelSeriesData={funnelSeriesData}
      />
    </TileShell>
  )
}

export const DashboardTileBody = ({
  tile,
  timeRange,
  onEdit,
  onDelete,
}: {
  tile: DashboardTile
  timeRange: TimeRange | undefined
  onEdit?: (tile: DashboardTile) => void
  onDelete?: (tile: DashboardTile) => void
}) => (
  <div className="group relative h-full">
    <div className={cn((onEdit || onDelete) && 'h-full')}>
      {tile.content.case === 'markdown' ? (
        <DashboardMarkdownTile tile={tile} />
      ) : (
        <DashboardInsightTile tile={tile} timeRange={timeRange} />
      )}
    </div>
    {onEdit || onDelete ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-4 right-4 z-20 opacity-0 transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100"
              onMouseDown={event => event.stopPropagation()}
            />
          }
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          {onEdit ? (
            <DropdownMenuItem onClick={() => onEdit(tile)}>
              <Edit3 className="size-4" />
              Edit
            </DropdownMenuItem>
          ) : null}
          {onDelete ? (
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(tile)}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null}
  </div>
)

export const DashboardEmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <TrendingUp className="mb-4 h-10 w-10 opacity-15" />
    <p className="mb-1 text-sm font-medium">{title}</p>
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
)
