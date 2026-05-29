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
} from '@/api/genproto/shared/insights/v1/insights_pb'
import ProjectLink from '@/components/project-link'
import SectionHeader from '@/components/section-header'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import { ActivityMapTile } from './activity-map-tile'
import CampaignsBlock from './campaigns-block'
import EventFeedBlock from './event-feed-block'
import FunnelTile from './funnel-tile'
import type { GlobalOverrides } from './global-overrides'
import KpiTile from './kpi-tile'
import { overviewBindingsAtom, overviewSchemaAtom } from './overview.atoms'
import { OverviewTileShell } from './overview-tile-shell'
import PlatformTile, { resolveOsPropertyKey } from './platform-tile'
import ProfilesBlock from './profiles-block'
import { composeFunnelSteps } from './tile-bindings'
import TopEventsBlock from './top-events-block'

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

const buildRetentionQuery = (kind: string) =>
  create(QueryRequestSchema, {
    spec: create(InsightQuerySpecSchema, {
      insightType: InsightType.RETENTION,
      events: [
        create(EventQuerySchema, { event: create(EventFilterSchema, { kind }) }),
        create(EventQuerySchema, { event: create(EventFilterSchema, { kind }) }),
      ],
    }),
  })

const AnalyticsMode = ({ globalTimeRange, globalGranularity }: Props) => {
  const schema = useAtomValue(overviewSchemaAtom)
  const bindings = useAtomValue(overviewBindingsAtom)
  if (!schema || !bindings) return null

  const funnelSteps = composeFunnelSteps(bindings)
  const osPropertyKey = resolveOsPropertyKey(schema)
  const showConversionSection = funnelSteps.length >= 2 || osPropertyKey !== null

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

        <div className="mt-[18px] grid min-h-0 grid-cols-1 gap-[18px] lg:h-[360px] lg:grid-cols-3">
          <div className="h-[360px] min-h-0 overflow-hidden lg:h-full">
            <ActivityMapTile
              schema={schema}
              primary={bindings.primary}
              globalTimeRange={globalTimeRange}
              globalGranularity={globalGranularity}
            />
          </div>
          <div className="min-h-0 overflow-hidden lg:col-span-2 lg:h-full">
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

        <OverviewTileShell
          title="Retention"
          footer={`via ${bindings.primary} → ${bindings.primary}`}
          contentClassName="flex flex-col"
          className="mt-[18px] h-[520px]"
        >
          <div className="min-h-0 flex-1">
            <DashboardInsightContent
              query={buildRetentionQuery(bindings.primary)}
              defaultTimeRange={TimeRangePreset.LAST_90_DAYS}
              timeRangeOverride={globalTimeRange}
              granularityOverride={globalGranularity}
              viewMode={DashboardTileViewMode.UNSPECIFIED}
              queryKeyPrefix="overview-retention"
            />
          </div>
        </OverviewTileShell>
      </section>

      {showConversionSection ? (
        <section>
          <SectionHeader title="Conversion" />
          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
            <FunnelTile bindings={bindings} globalTimeRange={globalTimeRange} globalGranularity={globalGranularity} />
            <PlatformTile
              schema={schema}
              primary={bindings.primary}
              globalTimeRange={globalTimeRange}
              globalGranularity={globalGranularity}
            />
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader title="People & comms" />
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3">
          <ProfilesBlock />
          <CampaignsBlock />
          <EventFeedBlock globalTimeRange={globalTimeRange} />
        </div>
      </section>

      <section>
        <SectionHeader title="Schema" count={`${schema.events.length} kinds`} />
        <TopEventsBlock events={schema.events} />
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
