import { useAtomValue } from 'jotai'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { overviewBindingsAtom, overviewSchemaAtom } from './overview.atoms'

type Props = {
  globalTimeRange: TimeRange | undefined
  globalGranularity: Granularity | undefined
}

const SectionDivider = ({ title, count }: { title: string; count?: string }) => (
  <div className="mb-3 flex items-center gap-2">
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    <div className="h-px flex-1 bg-border" />
    {count ? <span className="text-[10px] text-muted-foreground">{count}</span> : null}
  </div>
)

const AnalyticsMode = ({ globalTimeRange: _globalTimeRange, globalGranularity: _globalGranularity }: Props) => {
  const schema = useAtomValue(overviewSchemaAtom)
  const bindings = useAtomValue(overviewBindingsAtom)
  if (!schema || !bindings) return null

  return (
    <div className="space-y-10">
      <section>
        <SectionDivider title="Activity" />
        <div className="text-sm text-muted-foreground">
          KPI strip + trend + retention (Tasks 7-9). primary={bindings.primary}
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
