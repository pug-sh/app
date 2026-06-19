import { useAtomValue } from 'jotai'
import { TrendingUp } from 'lucide-react'
import { memo } from 'react'
import {
  AggregationType,
  type Granularity,
  type RetentionSeries,
  TopKQuery_Dimension,
  type TopKRow,
  type UserFlowResult,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { Button } from '@/components/ui/button'
import { activeProjectTimezoneAtom } from '@/data/workspace.atoms'
import { getSeriesColor, type SeriesColor } from '@/lib/event-colors'
import {
  AreaChart,
  BarChart,
  type ChartPoint,
  DataTable,
  FunnelBreakdownView,
  FunnelChart,
  type FunnelSeriesData,
  LineChart,
  RetentionCohort,
  SankeyChart,
  SummaryStats,
  TopKList,
} from './charts'
import { EMPTY_ARRAY, type ViewMode } from './constants'

export const InsightsContent = memo(function InsightsContent({
  error,
  retry,
  unknownResultCase,
  resultCase,
  resultSeriesCount,
  isRetention,
  isTrends,
  isUserFlow,
  hasIncompleteNumericAggregation,
  chartData,
  seriesNames,
  seriesColors,
  seriesAggregations,
  viewMode,
  granularity,
  breakdowns,
  breakdownResponseLimit,
  retentionSeriesList,
  retentionLabels,
  retentionCohorts,
  funnelSeriesData,
  userFlowResult,
  isTopK = false,
  topKRows = EMPTY_ARRAY,
  topKDimension = TopKQuery_Dimension.EVENT_KIND,
  topKMetric = AggregationType.TOTAL,
  topKIncompleteReason = null,
  compact = false,
  lightNumbers = false,
}: {
  error: string | null
  retry: () => void
  unknownResultCase: boolean
  resultCase?: string
  resultSeriesCount: number
  isRetention: boolean
  isTrends: boolean
  isUserFlow: boolean
  hasIncompleteNumericAggregation: boolean
  chartData: ChartPoint[]
  seriesNames: string[]
  seriesColors: SeriesColor[]
  seriesAggregations: AggregationType[]
  viewMode: ViewMode
  granularity: Granularity
  breakdowns: string[]
  breakdownResponseLimit: number
  retentionSeriesList: RetentionSeries[]
  retentionLabels: string[]
  retentionCohorts: RetentionSeries['cohorts']
  funnelSeriesData: FunnelSeriesData[]
  userFlowResult?: UserFlowResult
  isTopK?: boolean
  topKRows?: TopKRow[]
  topKDimension?: TopKQuery_Dimension
  topKMetric?: AggregationType
  topKIncompleteReason?: string | null
  compact?: boolean
  lightNumbers?: boolean
}) {
  // Bucket labels render in the project's reporting zone so they match the
  // server-computed bucket boundaries (the server buckets in this same zone).
  const timeZone = useAtomValue(activeProjectTimezoneAtom)
  const allZero = chartData.every(d => d.values.every(v => v === 0))
  const hasFunnelData = funnelSeriesData.some(s => s.steps.some(step => step.count > 0))
  const chartClassName = compact ? 'h-full min-h-[120px] w-full' : undefined

  const showUserFlow = isUserFlow || resultCase === 'userFlow'

  const renderLoadingEmptyState = () => (
    <div
      className={
        compact
          ? 'flex flex-col items-center justify-center py-8 text-muted-foreground'
          : 'flex flex-col items-center justify-center py-20 text-muted-foreground'
      }
    >
      <TrendingUp className="w-10 h-10 mb-4 opacity-15" />
      <p className="text-sm font-medium mb-1">No data yet</p>
      <p className="text-xs">
        {showUserFlow
          ? 'Adjust the query above to explore transitions'
          : isTopK
            ? 'Loading ranking'
            : 'Pick an event above to start'}
      </p>
    </div>
  )

  const renderNoEvents = () => (
    <div
      className={
        compact
          ? 'flex h-full min-h-32 items-center justify-center text-muted-foreground'
          : 'flex h-48 items-center justify-center text-muted-foreground'
      }
    >
      <p className="text-sm">
        {showUserFlow ? 'No transitions recorded in this period' : 'No events recorded in this period'}
      </p>
    </div>
  )

  const renderTruncationNotice = (count: number) => {
    if (breakdowns.length === 0 || count < breakdownResponseLimit) return null
    return (
      <p className="text-[11px] text-muted-foreground mt-2">
        Showing top {breakdownResponseLimit} — additional breakdown values may be hidden.
      </p>
    )
  }

  const renderChart = () => {
    if (allZero) return renderNoEvents()
    if (viewMode === 'line')
      return (
        <LineChart
          data={chartData}
          seriesNames={seriesNames}
          seriesColors={seriesColors}
          granularity={granularity}
          timeZone={timeZone}
          className={chartClassName}
        />
      )
    if (viewMode === 'area')
      return (
        <AreaChart
          data={chartData}
          seriesNames={seriesNames}
          seriesColors={seriesColors}
          granularity={granularity}
          timeZone={timeZone}
          className={chartClassName}
        />
      )
    if (viewMode === 'table')
      return (
        <DataTable
          data={chartData}
          seriesNames={seriesNames}
          seriesColors={seriesColors}
          granularity={granularity}
          timeZone={timeZone}
        />
      )
    return (
      <BarChart
        data={chartData}
        seriesNames={seriesNames}
        seriesColors={seriesColors}
        granularity={granularity}
        timeZone={timeZone}
        stacked={viewMode === 'bar-stacked'}
        className={chartClassName}
      />
    )
  }

  const renderFunnelContent = () => {
    if (funnelSeriesData.length === 0) return renderLoadingEmptyState()
    if (!hasFunnelData) return renderNoEvents()

    const funnelBody =
      breakdowns.length > 0 ? (
        <>
          <FunnelBreakdownView series={funnelSeriesData} />
          {renderTruncationNotice(funnelSeriesData.length)}
        </>
      ) : (
        <FunnelChart series={funnelSeriesData} compact={compact} />
      )

    if (compact) {
      return <div className="flex h-full min-h-0 flex-col">{funnelBody}</div>
    }

    return funnelBody
  }

  const renderUserFlowContent = () => {
    if (!userFlowResult) return renderLoadingEmptyState()
    if (userFlowResult.links.length === 0) return renderNoEvents()
    return <SankeyChart result={userFlowResult} className={compact ? 'h-full min-h-[120px] w-full' : undefined} />
  }

  const renderTopKContent = () => {
    if (topKIncompleteReason) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <TrendingUp className="w-10 h-10 mb-4 opacity-15" />
          <p className="text-sm">{topKIncompleteReason}</p>
        </div>
      )
    }
    if (topKRows.length > 0) {
      return <TopKList rows={topKRows} dimension={topKDimension} metric={topKMetric} compact={compact} />
    }
    if (resultCase === 'topK') return renderNoEvents()
    return renderLoadingEmptyState()
  }

  const renderRetentionContent = () => {
    if (retentionSeriesList.length === 0) return renderLoadingEmptyState()
    if (breakdowns.length > 0) {
      return (
        <div className="space-y-6 mt-2">
          {retentionSeriesList.map((series, si) => {
            const cohortColors = series.cohorts.map((c, ci) => getSeriesColor(c.cohort || `Cohort ${ci + 1}`, ci))
            return (
              <div key={retentionLabels[si] ?? si}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {retentionLabels[si]}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <RetentionCohort
                  cohorts={series.cohorts}
                  granularity={granularity}
                  timeZone={timeZone}
                  seriesColors={cohortColors}
                />
              </div>
            )
          })}
          {renderTruncationNotice(retentionSeriesList.length)}
        </div>
      )
    }
    if (retentionCohorts.length === 0) return renderLoadingEmptyState()
    return (
      <RetentionCohort
        cohorts={retentionCohorts}
        granularity={granularity}
        timeZone={timeZone}
        seriesColors={seriesColors}
      />
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <TrendingUp className="w-10 h-10 mb-4 opacity-15" />
        <p className="text-sm font-medium mb-1">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={retry}>
          Retry
        </Button>
      </div>
    )
  }

  if (unknownResultCase) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <TrendingUp className="w-10 h-10 mb-4 opacity-15" />
        <p className="text-sm">Unsupported result type</p>
      </div>
    )
  }

  if ((resultCase === 'retention' || resultCase === 'funnel') && resultSeriesCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <TrendingUp className="w-10 h-10 mb-4 opacity-15" />
        <p className="text-sm">No results — try adjusting your query</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={retry}>
          Retry
        </Button>
      </div>
    )
  }

  if (showUserFlow) return renderUserFlowContent()
  if (isTopK) return renderTopKContent()
  if (isRetention) return renderRetentionContent()
  if (!isTrends) return renderFunnelContent()
  if (hasIncompleteNumericAggregation) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <TrendingUp className="w-10 h-10 mb-4 opacity-15" />
        <p className="text-sm">Select a numeric property to run this aggregation</p>
      </div>
    )
  }

  if (chartData.length > 0) {
    return (
      <div className={compact ? 'flex h-full min-h-0 flex-col gap-3' : undefined}>
        <SummaryStats
          series={seriesNames}
          data={chartData}
          seriesColors={seriesColors}
          aggregations={seriesAggregations}
          compact={compact}
          showSeriesNames={breakdowns.length > 0}
          lightNumbers={lightNumbers}
        />
        <div className={compact ? 'min-h-0 flex-1 pt-1' : undefined}>{renderChart()}</div>
      </div>
    )
  }

  return renderLoadingEmptyState()
})
