import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import {
  type DashboardTile,
  DashboardTileViewMode,
  VisualizationOptions_YAxisFormat,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  type Granularity,
  type InsightQuerySpec,
  InsightType,
  type QueryResponse,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { resolvedThemeAtom } from '@/data/theme.atoms'
import { getIndexedColor, getSeriesColor } from '@/lib/event-colors'
import { isIncompleteNumericAggregation } from '../insights/constants'
import { InsightsContent } from '../insights/content'
import { breakdownLabel, buildChartData, disambiguateLabels, sortFunnelSteps } from '../insights/helpers'
import { topKSpecIncompleteReason } from '../insights/top-k'
import { BREAKDOWN_RESPONSE_LIMIT } from './constants'
import { type KpiCompare, KpiTile } from './kpi-tile'
import { dashboardTileViewModeToViewMode } from './tile-settings'

export const formatYAxisValue = (format: VisualizationOptions_YAxisFormat | undefined) => {
  return (value: number): string => {
    if (!Number.isFinite(value)) return '—'
    switch (format) {
      case VisualizationOptions_YAxisFormat.PERCENT:
        return `${(value * 100).toFixed(1)}%`
      case VisualizationOptions_YAxisFormat.DURATION_MS:
        return formatDuration(value)
      case VisualizationOptions_YAxisFormat.COMPACT:
        return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
      default:
        return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
  }
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = seconds / 60
  if (minutes < 60) return `${minutes.toFixed(1)}m`
  return `${(minutes / 60).toFixed(1)}h`
}

const noop = () => {}

// Presentational core of an insight tile: given an already-resolved query result
// (from a live fetch OR a server-pre-rendered RenderedTile) plus the tile's spec,
// derive the chart series and render either a KPI or the full InsightsContent.
// Holds no data atoms/RPC/fetching (only subscribes to the theme so colors adapt) —
// both the authenticated tile (DashboardInsightContent) and the public shared tile
// (SharedTileBody) render through this.
export const InsightTileView = ({
  tile,
  viewMode,
  spec,
  result,
  granularity,
  error,
  onRetry,
  compare,
  compact = false,
  kpiMetadata,
  lightMetrics = false,
}: {
  // Pass either a full DashboardTile (for dashboard pages, where threshold + compare
  // + viz options apply) or just a viewMode (for overview/static tiles).
  tile?: DashboardTile
  viewMode?: DashboardTileViewMode
  spec: InsightQuerySpec | undefined
  result: QueryResponse['result']
  granularity: Granularity
  error?: string | null
  onRetry?: () => void
  // Live KPI compare only; the public render has no comparison and passes undefined.
  compare?: KpiCompare
  compact?: boolean
  kpiMetadata?: string
  lightMetrics?: boolean
}) => {
  const resolvedViewMode = tile?.viewMode ?? viewMode
  const effectiveViewMode = useMemo(() => dashboardTileViewModeToViewMode(resolvedViewMode), [resolvedViewMode])

  // Series colors are theme-adapted (see event-colors.ts). Subscribe so a theme
  // toggle re-renders and re-derives the memoized palettes below.
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  // A configured Y-axis format drives the chart axis ticks; Plain/unspecified is
  // left undefined so charts keep their compact default.
  const yAxisFormat = tile?.visualization?.yAxisFormat
  const yTickFormatter = useMemo(() => {
    if (yAxisFormat === undefined || yAxisFormat === VisualizationOptions_YAxisFormat.UNSPECIFIED) return undefined
    return formatYAxisValue(yAxisFormat)
  }, [yAxisFormat])

  const trendSeries = useMemo(() => (result.case === 'trends' ? [...result.value.series] : []), [result])
  const funnelSeriesList = useMemo(() => (result.case === 'funnel' ? result.value.series : []), [result])
  const retentionSeriesList = useMemo(() => (result.case === 'retention' ? result.value.series : []), [result])
  const topKRows = useMemo(() => (result.case === 'topK' ? result.value.rows : []), [result])
  const userFlowResult = useMemo(() => (result.case === 'userFlow' ? result.value : undefined), [result])
  const chartData = useMemo(() => buildChartData(trendSeries), [trendSeries])
  const kindOrder = useMemo(() => (spec?.events ?? []).map(entry => entry.event?.kind ?? ''), [spec?.events])
  const funnelSeriesData = useMemo(() => {
    const labels = disambiguateLabels(
      funnelSeriesList.map((series, index) => breakdownLabel(series.breakdown, `Series ${index + 1}`)),
    )
    return funnelSeriesList.map((series, index) => ({
      label: labels[index],
      steps: sortFunnelSteps(series.steps, kindOrder),
      // Breakdown funnels: distinct color per split (see getIndexedColor).
      color: getIndexedColor(index).dot,
    }))
  }, [funnelSeriesList, kindOrder, resolvedTheme])
  const retentionLabels = useMemo(
    () =>
      disambiguateLabels(
        retentionSeriesList.map((series, index) => breakdownLabel(series.breakdown, `Series ${index + 1}`)),
      ),
    [retentionSeriesList],
  )
  const retentionCohorts = useMemo(() => retentionSeriesList[0]?.cohorts ?? [], [retentionSeriesList])
  const isTrends = spec?.insightType === InsightType.TRENDS
  const isRetention = spec?.insightType === InsightType.RETENTION
  const isUserFlow = spec?.insightType === InsightType.USER_FLOW
  const isTopK = spec?.insightType === InsightType.TOP_K
  const topKIncompleteReason = isTopK ? topKSpecIncompleteReason(spec) : null
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
  const seriesColors = useMemo(() => {
    // Breakdown splits (by $os, $utmSource, …) have no semantic palette identity,
    // so color them by index for distinctness; coloring by the "event · value"
    // label made every split inherit the event's family hue (all blue). Without a
    // breakdown, keep the event kind's semantic color.
    if (result.case === 'trends') {
      return trendSeries.map((series, index) =>
        breakdownLabel(series.breakdown, '')
          ? getIndexedColor(index)
          : getSeriesColor(series.eventKind || `Series ${index + 1}`, index),
      )
    }
    return seriesNames.map((name, index) => getSeriesColor(name, index))
  }, [result.case, trendSeries, seriesNames, resolvedTheme])
  const seriesAggregations = useMemo(
    () => (spec?.events ?? []).map(entry => entry.aggregation ?? AggregationType.TOTAL),
    [spec?.events],
  )
  const hasIncompleteNumericAggregation = useMemo(
    () =>
      (spec?.events ?? []).some(entry => isIncompleteNumericAggregation(entry.aggregation, entry.aggregationProperty)),
    [spec?.events],
  )

  // KPI tiles short-circuit the chart pipeline. The compare delta (when present) is
  // assembled by the caller — the public render has no comparison, so `compare` is
  // undefined and KpiTile degrades to a no-delta sparkline. Top-k results are not
  // series-shaped, so they always render through the ranked list regardless of view mode.
  if (tile && resolvedViewMode === DashboardTileViewMode.KPI && !isTopK) {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <KpiTile
          tile={tile}
          currentSeries={trendSeries}
          compare={compare}
          formatValue={formatYAxisValue(tile.visualization?.yAxisFormat)}
          metadata={kpiMetadata}
          lightMetric={lightMetrics}
        />
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <InsightsContent
        error={error ?? null}
        retry={onRetry ?? noop}
        unknownResultCase={
          !!result.case && !['trends', 'funnel', 'retention', 'topK', 'userFlow'].includes(result.case)
        }
        resultCase={result.case}
        resultSeriesCount={
          result.case === 'trends' || result.case === 'funnel' || result.case === 'retention'
            ? result.value.series.length
            : 0
        }
        isRetention={isRetention}
        isTrends={isTrends}
        isUserFlow={isUserFlow}
        hasIncompleteNumericAggregation={hasIncompleteNumericAggregation}
        chartData={chartData}
        seriesNames={seriesNames}
        seriesColors={seriesColors}
        seriesAggregations={seriesAggregations}
        viewMode={effectiveViewMode}
        granularity={granularity}
        breakdowns={(spec?.breakdowns ?? []).map(item => item.property)}
        breakdownResponseLimit={spec?.breakdownLimit ?? BREAKDOWN_RESPONSE_LIMIT}
        retentionSeriesList={retentionSeriesList}
        retentionLabels={retentionLabels}
        retentionCohorts={retentionCohorts}
        funnelSeriesData={funnelSeriesData}
        userFlowResult={userFlowResult}
        isTopK={isTopK}
        topKRows={topKRows}
        topKDimension={spec?.topK?.dimension}
        topKMetric={spec?.topK?.metric}
        topKIncompleteReason={topKIncompleteReason}
        logScale={tile?.visualization?.logScale}
        zeroBaseline={tile?.visualization?.zeroBaseline}
        hideLegend={tile?.visualization?.hideLegend}
        yTickFormatter={yTickFormatter}
        compact={compact}
        lightNumbers={lightMetrics}
      />
    </div>
  )
}
