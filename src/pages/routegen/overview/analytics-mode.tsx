import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  EventQuerySchema,
  InsightQuerySpecSchema,
  InsightType,
  QueryRequestSchema,
  TopKQuery_Dimension,
  TopKQuerySchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import ProjectLink from '@/components/project-link'
import SectionHeader from '@/components/section-header'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import { ActivityMapTile } from './activity-map-tile'
import BreakdownTile from './breakdown-tile'
import FunnelTile from './funnel-tile'
import type { GlobalOverrides } from './global-overrides'
import KpiTile from './kpi-tile'
import { overviewBindingsAtom, overviewSchemaAtom } from './overview.atoms'
import { OverviewTileShell } from './overview-tile-shell'
import { composeFunnelSteps } from './tile-bindings'

// Device/acquisition auto-properties are queried literally rather than resolved from
// schema.autoPropertyKeys — that rollup is sparse and omits keys (e.g. $os) the raw
// events still carry. The Query RPC reads raw events, so these breakdowns populate.
const OS_PROPERTY = '$os'
const UTM_SOURCE_PROPERTY = '$utmSource'

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
    <div className="space-y-10">
      <section>
        <SectionHeader title="Activity" />
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            title="Active users"
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
          {bindings.signinLike ? (
            <KpiTile
              title="New signups"
              via={bindings.signinLike}
              query={buildTrendsQuery(bindings.signinLike, AggregationType.UNIQUE_USERS)}
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

        <div className="mt-[18px] grid min-h-0 grid-cols-1 gap-[18px] lg:h-[360px] lg:grid-cols-2">
          <div className="h-[360px] min-h-0 overflow-hidden lg:h-full">
            <ActivityMapTile
              schema={schema}
              primary={bindings.primary}
              globalTimeRange={globalTimeRange}
              globalGranularity={globalGranularity}
            />
          </div>
          <div className="min-h-0 overflow-hidden lg:h-full">
            <OverviewTileShell
              title="Active users trend"
              footer={`via ${bindings.primary}`}
              contentClassName="flex flex-col"
              className="h-[360px] lg:h-full"
            >
              <div className="min-h-0 flex-1">
                <DashboardInsightContent
                  query={buildTrendsQuery(bindings.primary, AggregationType.UNIQUE_USERS)}
                  defaultTimeRange={TimeRangePreset.LAST_90_DAYS}
                  timeRangeOverride={globalTimeRange}
                  granularityOverride={globalGranularity}
                  viewMode={DashboardTileViewMode.LINE}
                  queryKeyPrefix="overview-trend-active"
                />
              </div>
            </OverviewTileShell>
          </div>
        </div>
      </section>

      {showConversionSection ? (
        <section>
          <SectionHeader title="Conversion" />
          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
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
                />
              </div>
            </OverviewTileShell>
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Acquisition" />
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
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

      <section>
        <SectionHeader title="Top events" />
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

      <div className="border-t border-border/60 pt-6 text-center">
        <p className="text-xs text-muted-foreground">
          Want a view tailored to your team?{' '}
          <ProjectLink href="/dashboards" className="text-primary hover:underline underline-offset-4">
            Build your own →
          </ProjectLink>
        </p>
      </div>
    </div>
  )
}

export default AnalyticsMode
