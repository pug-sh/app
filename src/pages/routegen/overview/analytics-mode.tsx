import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  EventQuerySchema,
  Granularity,
  InsightQuerySpecSchema,
  InsightType,
  QueryRequestSchema,
  TopKQuery_Dimension,
  TopKQuerySchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import ProjectLink from '@/components/project-link'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import { ActivityMapTile } from './activity-map-tile'
import BreakdownTile from './breakdown-tile'
import FunnelTile from './funnel-tile'
import type { GlobalOverrides } from './global-overrides'
import KpiTile from './kpi-tile'
import { overviewBindingsAtom, overviewSchemaAtom } from './overview.atoms'
import OverviewSectionHeader from './overview-section-header'
import { OverviewTileShell } from './overview-tile-shell'
import { composeFunnelSteps } from './tile-bindings'

// Device/acquisition auto-properties are queried literally rather than resolved from
// schema.autoPropertyKeys — that rollup is sparse and omits keys (e.g. $os) the raw
// events still carry. The Query RPC reads raw events, so these breakdowns populate.
const OS_PROPERTY = '$os'
const UTM_SOURCE_PROPERTY = '$utmSource'

// A KPI over a series that isn't a count is an average across buckets, never a sum (SERIES_COLLAPSE)
// — a daily regular is one user, not thirty. So the title names the bucket, and moves with the
// granularity chip: an average over hours is not an average over days.
//
// Total over Granularity, like GRANULARITY_MAX_RANGE_MS and unlike GRANULARITY_MAX_RANGE_LABEL —
// that one's Partial is fine because a miss degrades to a generic message, whereas a miss here would
// assert a specific and false one.
const GRANULARITY_ADVERB = {
  // Never reached: resolveTileGranularity hands down a concrete value or undefined, and the
  // undefined case resolves to DAY below.
  [Granularity.UNSPECIFIED]: 'daily',
  [Granularity.MINUTE]: 'per-minute',
  [Granularity.HOUR]: 'hourly',
  [Granularity.DAY]: 'daily',
  [Granularity.WEEK]: 'weekly',
  [Granularity.MONTH]: 'monthly',
} as const satisfies Record<Granularity, string>

// globalGranularity arrives already resolved (resolveTileGranularity, in index.page.tsx), and is
// undefined only when the user has picked neither a range nor a granularity. The tiles then fall
// back to getInitialGranularity, which answers DAY for a query carrying no granularity of its own —
// as these do — so DAY is the honest default here too.
const perBucketAdverb = (granularity: Granularity | undefined) => GRANULARITY_ADVERB[granularity ?? Granularity.DAY]

type Props = GlobalOverrides

const buildTrendsQuery = (kind: string, aggregation: AggregationType) =>
  create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.TRENDS,
      events: [
        create(EventQuerySchema, {
          event: create(EventFilterSchema, { kind }),
          aggregation,
        }),
      ],
    }),
  })

const buildTopEventsQuery = () =>
  create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.TOP_K,
      topK: create(TopKQuerySchema, {
        dimension: TopKQuery_Dimension.EVENT_KIND,
        metric: AggregationType.TOTAL,
        limit: 10,
      }),
    }),
  })

const AnalyticsMode = ({ globalTimeRange, globalGranularity }: Props) => {
  const schema = useAtomValue(overviewSchemaAtom)
  const bindings = useAtomValue(overviewBindingsAtom)
  if (!schema || !bindings) return null

  const funnelSteps = composeFunnelSteps(bindings)
  const showConversionSection = funnelSteps.length >= 2
  // Prefer an explicit conversion-like event; otherwise the funnel's last step is the
  // deepest conversion. Only read in the showConversionSection branch, where funnelSteps
  // has >= 2 entries, so the fallback index is always valid.
  const conversionKind = bindings.conversionLike ?? funnelSteps[funnelSteps.length - 1]

  return (
    <div className="flex flex-col gap-9">
      <section className="flex flex-col gap-4">
        <OverviewSectionHeader title="Activity" description="Who's showing up and how engaged they are." />
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
            <KpiTile
              title={`Avg ${perBucketAdverb(globalGranularity)} active users`}
              via={bindings.primary}
              query={buildTrendsQuery(bindings.primary, AggregationType.UNIQUE_USERS)}
              globalTimeRange={globalTimeRange}
              globalGranularity={globalGranularity}
              queryKeyPrefix="overview-kpi-active"
            />
            <KpiTile
              title="Event volume"
              via={bindings.primary}
              query={buildTrendsQuery(bindings.primary, AggregationType.TOTAL)}
              globalTimeRange={globalTimeRange}
              globalGranularity={globalGranularity}
              queryKeyPrefix="overview-kpi-volume"
            />
            <KpiTile
              title={`Avg ${perBucketAdverb(globalGranularity)} events per user`}
              via={bindings.primary}
              query={buildTrendsQuery(bindings.primary, AggregationType.PER_USER_AVG)}
              globalTimeRange={globalTimeRange}
              globalGranularity={globalGranularity}
              queryKeyPrefix="overview-kpi-avg-per-user"
            />
            {bindings.signinLike ? (
              <KpiTile
                title="New signups"
                via={bindings.signinLike}
                // The title promises a count over the whole window, so the aggregation has to be one
                // whose buckets sum. Per-bucket uniques don't, and would render a sixty-signup month
                // as the average: "New signups: 2".
                query={buildTrendsQuery(bindings.signinLike, AggregationType.TOTAL)}
                globalTimeRange={globalTimeRange}
                globalGranularity={globalGranularity}
                queryKeyPrefix="overview-kpi-signups"
              />
            ) : null}
            {bindings.conversionLike ? (
              <KpiTile
                title="Conversions"
                via={bindings.conversionLike}
                query={buildTrendsQuery(bindings.conversionLike, AggregationType.TOTAL)}
                globalTimeRange={globalTimeRange}
                globalGranularity={globalGranularity}
                queryKeyPrefix="overview-kpi-conversions"
              />
            ) : null}
          </div>

          <div className="grid min-h-0 grid-cols-1 gap-3.5 lg:h-[440px] lg:grid-cols-5">
            <div className="h-[440px] min-h-0 overflow-hidden lg:col-span-2 lg:h-full">
              <ActivityMapTile
                schema={schema}
                primary={bindings.primary}
                globalTimeRange={globalTimeRange}
                globalGranularity={globalGranularity}
              />
            </div>
            <div className="min-h-0 overflow-hidden lg:col-span-3 lg:h-full">
              <OverviewTileShell
                title="Active users trend"
                footer={`via ${bindings.primary}`}
                contentClassName="flex flex-col"
                className="h-[440px] lg:h-full"
              >
                <div className="min-h-0 flex-1">
                  <DashboardInsightContent
                    query={buildTrendsQuery(bindings.primary, AggregationType.UNIQUE_USERS)}
                    defaultTimeRange={TimeRangePreset.LAST_90_DAYS}
                    timeRangeOverride={globalTimeRange}
                    granularityOverride={globalGranularity}
                    viewMode={DashboardTileViewMode.LINE}
                    queryKeyPrefix="overview-trend-active"
                    compact
                    lightMetrics
                  />
                </div>
              </OverviewTileShell>
            </div>
          </div>
        </div>
      </section>

      {showConversionSection ? (
        <section className="flex flex-col gap-4">
          <OverviewSectionHeader title="Conversion" description="How users move toward your key outcome." />
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <FunnelTile bindings={bindings} globalTimeRange={globalTimeRange} globalGranularity={globalGranularity} />
            <OverviewTileShell
              title="Conversion trend"
              footer={`via ${conversionKind}`}
              contentClassName="flex flex-col"
              className="h-[480px]"
            >
              <div className="min-h-0 flex-1">
                <DashboardInsightContent
                  query={buildTrendsQuery(conversionKind, AggregationType.TOTAL)}
                  defaultTimeRange={TimeRangePreset.LAST_90_DAYS}
                  timeRangeOverride={globalTimeRange}
                  granularityOverride={globalGranularity}
                  viewMode={DashboardTileViewMode.LINE}
                  queryKeyPrefix="overview-trend-conversion"
                  compact
                  lightMetrics
                />
              </div>
            </OverviewTileShell>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <OverviewSectionHeader title="Acquisition" description="Where your users are coming from." />
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <BreakdownTile
            title="Platform breakdown"
            eventKind={bindings.primary}
            breakdownProperty={OS_PROPERTY}
            queryKeyPrefix="overview-breakdown-os"
            globalTimeRange={globalTimeRange}
            globalGranularity={globalGranularity}
          />
          <BreakdownTile
            title="Traffic source"
            eventKind={bindings.primary}
            breakdownProperty={UTM_SOURCE_PROPERTY}
            queryKeyPrefix="overview-breakdown-utm-source"
            globalTimeRange={globalTimeRange}
            globalGranularity={globalGranularity}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <OverviewSectionHeader title="Top events" description="The most frequent events across all kinds." />
        <OverviewTileShell title="Most frequent events" footer="across all events" className="h-[420px]">
          <DashboardInsightContent
            query={buildTopEventsQuery()}
            defaultTimeRange={TimeRangePreset.LAST_90_DAYS}
            timeRangeOverride={globalTimeRange}
            granularityOverride={globalGranularity}
            queryKeyPrefix="overview-top-events"
            compact
          />
        </OverviewTileShell>
      </section>

      <div className="border-t border-border/60 pt-1.5 text-center">
        <p className="text-xs text-muted-foreground">
          Want a view tailored to your team?{' '}
          <ProjectLink href="/dashboards" className="text-link hover:underline underline-offset-4">
            Build your own →
          </ProjectLink>
        </p>
      </div>
    </div>
  )
}

export default AnalyticsMode
