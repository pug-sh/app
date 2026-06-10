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
import { getSeriesColor } from '@/lib/event-colors'
import { NUMERIC_AGGREGATIONS } from '../insights/constants'
import { InsightsContent } from '../insights/content'
import { breakdownLabel, buildChartData, disambiguateLabels, sortFunnelSteps } from '../insights/helpers'
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
// Holds no atoms/RPC/fetching — both the authenticated tile (DashboardInsightContent)
// and the public shared tile (SharedTileBody) render through this.
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
}) => {
  const resolvedViewMode = tile?.viewMode ?? viewMode
  const effectiveViewMode = useMemo(() => dashboardTileViewModeToViewMode(resolvedViewMode), [resolvedViewMode])

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
  const chartData = useMemo(() => buildChartData(trendSeries), [trendSeries])
  const kindOrder = useMemo(() => (spec?.events ?? []).map(entry => entry.event?.kind ?? ''), [spec?.events])
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
  const isTrends = spec?.insightType === InsightType.TRENDS
  const isRetention = spec?.insightType === InsightType.RETENTION
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
    () => (spec?.events ?? []).map(entry => entry.aggregation ?? AggregationType.TOTAL),
    [spec?.events],
  )
  const hasIncompleteNumericAggregation = useMemo(
    () =>
      (spec?.events ?? []).some(
        entry =>
          NUMERIC_AGGREGATIONS.has(entry.aggregation ?? AggregationType.TOTAL) &&
          !(entry.aggregationProperty ?? '').trim(),
      ),
    [spec?.events],
  )

  // KPI tiles short-circuit the chart pipeline. The compare delta (when present) is
  // assembled by the caller — the public render has no comparison, so `compare` is
  // undefined and KpiTile degrades to a no-delta sparkline.
  if (tile && resolvedViewMode === DashboardTileViewMode.KPI) {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <KpiTile
          tile={tile}
          currentSeries={trendSeries}
          compare={compare}
          formatValue={formatYAxisValue(tile.visualization?.yAxisFormat)}
        />
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <InsightsContent
        error={error ?? null}
        retry={onRetry ?? noop}
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
        viewMode={effectiveViewMode}
        granularity={granularity}
        breakdowns={(spec?.breakdowns ?? []).map(item => item.property)}
        breakdownResponseLimit={spec?.breakdownLimit ?? BREAKDOWN_RESPONSE_LIMIT}
        retentionSeriesList={retentionSeriesList}
        retentionLabels={retentionLabels}
        retentionCohorts={retentionCohorts}
        funnelSeriesData={funnelSeriesData}
        logScale={tile?.visualization?.logScale}
        zeroBaseline={tile?.visualization?.zeroBaseline}
        hideLegend={tile?.visualization?.hideLegend}
        yTickFormatter={yTickFormatter}
        compact={compact}
      />
    </div>
  )
}
