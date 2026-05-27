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
import SectionHeader from '@/components/section-header'
import { DashboardInsightContent } from '../dashboards/insight-tile-content'
import CampaignsBlock from './campaigns-block'
import EventFeedBlock from './event-feed-block'
import FunnelTile from './funnel-tile'
import type { GlobalOverrides } from './global-overrides'
import KpiTile from './kpi-tile'
import { overviewBindingsAtom, overviewSchemaAtom } from './overview.atoms'
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex h-[480px] min-h-0 flex-col rounded-lg border border-border/60 bg-background p-4">
            <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
              <h3 className="truncate text-sm font-semibold">Active users trend</h3>
            </div>
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
            <p className="mt-2 shrink-0 font-mono text-[10px] text-muted-foreground">via {bindings.primary}</p>
          </div>

          <div className="flex h-[480px] min-h-0 flex-col rounded-lg border border-border/60 bg-background p-4">
            <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
              <h3 className="truncate text-sm font-semibold">Retention</h3>
            </div>
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
            <p className="mt-2 shrink-0 font-mono text-[10px] text-muted-foreground">
              via {bindings.primary} → {bindings.primary}
            </p>
          </div>
        </div>
      </section>

      {showConversionSection ? (
        <section>
          <SectionHeader title="Conversion" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ProfilesBlock />
          <CampaignsBlock />
          <EventFeedBlock primary={bindings.primary} globalTimeRange={globalTimeRange} />
        </div>
      </section>

      <section>
        <SectionHeader title="Schema" count={`${schema.events.length} kinds`} />
        <TopEventsBlock events={schema.events} />
      </section>
    </div>
  )
}

export default AnalyticsMode
