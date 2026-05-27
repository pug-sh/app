import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
  AggregationType,
  EventQuerySchema,
  type Granularity,
  InsightType,
  QueryRequestSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import KpiTile from './kpi-tile'
import { overviewBindingsAtom, overviewSchemaAtom } from './overview.atoms'

type Props = {
  globalTimeRange: TimeRange | undefined
  globalGranularity: Granularity | undefined
}

const buildTrendsQuery = (kind: string, aggregation: AggregationType) =>
  create(QueryRequestSchema, {
    insightType: InsightType.TRENDS,
    events: [
      create(EventQuerySchema, {
        event: create(EventFilterSchema, { kind }),
        aggregation,
      }),
    ],
  })

const SectionDivider = ({ title, count }: { title: string; count?: string }) => (
  <div className="mb-3 flex items-center gap-2">
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    <div className="h-px flex-1 bg-border" />
    {count ? <span className="text-[10px] text-muted-foreground">{count}</span> : null}
  </div>
)

const AnalyticsMode = ({ globalTimeRange, globalGranularity }: Props) => {
  const schema = useAtomValue(overviewSchemaAtom)
  const bindings = useAtomValue(overviewBindingsAtom)
  if (!schema || !bindings) return null

  return (
    <div className="space-y-10">
      <section>
        <SectionDivider title="Activity" />
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
      </section>

      <section>
        <SectionDivider title="Conversion" />
        <div className="text-sm text-muted-foreground">Funnel + platform breakdown (Tasks 10-11).</div>
      </section>

      <section>
        <SectionDivider title="People & comms" />
        <div className="text-sm text-muted-foreground">Profiles + campaigns + event feed (Tasks 12-14).</div>
      </section>

      <section>
        <SectionDivider title="Schema" count={`${schema.events.length} kinds`} />
        <div className="text-sm text-muted-foreground">Top events (Task 15).</div>
      </section>
    </div>
  )
}

export default AnalyticsMode
