import { useAtomValue, useSetAtom } from 'jotai'
import { Clock, LayoutDashboard } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import ProjectLink from '@/components/project-link'
import { Button } from '@/components/ui/button'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { readTimeGranularityQueryParams, writeTimeGranularityQueryParams } from '@/hooks/use-filter-query-params'
import { INSIGHTS_PRESETS } from '@/lib/date-presets'
import { GRANULARITIES } from '../insights/constants'
import { OptionChip } from '../insights/controls'
import AnalyticsMode from './analytics-mode'
import {
  fetchOverviewSchemaAtom,
  overviewSchemaAtom,
  overviewSchemaErrorAtom,
  overviewSchemaLoadingAtom,
} from './overview.atoms'
import SetupMode from './setup-mode'

const DAY_MS = 24 * 60 * 60 * 1000

const GLOBAL_GRANULARITIES = [{ label: 'Auto', value: Granularity.UNSPECIFIED }, ...GRANULARITIES] as const

const getAutoGlobalGranularity = (range: TimeRange | undefined) => {
  if (!range) return Granularity.UNSPECIFIED
  const durationMs = Math.max(0, range.to.getTime() - range.from.getTime())
  if (durationMs <= DAY_MS) return Granularity.HOUR
  if (durationMs <= 90 * DAY_MS) return Granularity.DAY
  if (durationMs <= 365 * DAY_MS) return Granularity.WEEK
  return Granularity.MONTH
}

const Overview = () => {
  const project = useAtomValue(activeProjectAtom)
  const schema = useAtomValue(overviewSchemaAtom)
  const loading = useAtomValue(overviewSchemaLoadingAtom)
  const error = useAtomValue(overviewSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchOverviewSchemaAtom)

  const initialOverrides = useMemo(() => readTimeGranularityQueryParams(), [])
  const [globalTimeRange, setGlobalTimeRange] = useState<TimeRange | undefined>(() => initialOverrides.timeRange)
  // Stores only the user's explicit pick. UNSPECIFIED means "auto-derive from time range"
  // and the derivation happens at the consumption point below, so it stays in sync as the
  // user changes the time-range picker.
  const [globalGranularity, setGlobalGranularity] = useState<Granularity>(
    () => initialOverrides.granularity ?? Granularity.UNSPECIFIED,
  )

  useEffect(() => {
    if (project) fetchSchema()
  }, [fetchSchema, project])

  useEffect(() => {
    writeTimeGranularityQueryParams({ timeRange: globalTimeRange, granularity: globalGranularity })
  }, [globalGranularity, globalTimeRange])

  if (!project) return <NoProject title="Overview" icon={LayoutDashboard} />

  const hasEvents = (schema?.events.length ?? 0) > 0
  const effectiveGranularity =
    globalGranularity === Granularity.UNSPECIFIED ? getAutoGlobalGranularity(globalTimeRange) : globalGranularity
  const tileGranularityOverride = effectiveGranularity === Granularity.UNSPECIFIED ? undefined : effectiveGranularity

  const pageActions = hasEvents ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <DateRangePicker
        value={globalTimeRange}
        onChange={setGlobalTimeRange}
        presets={INSIGHTS_PRESETS}
        allowUnset
        unsetLabel="Select time"
      />
      <OptionChip
        label="granularity"
        icon={Clock}
        options={GLOBAL_GRANULARITIES}
        value={globalGranularity}
        onChange={setGlobalGranularity}
      />
      <ProjectLink href="/dashboards" className="ml-1 text-xs text-primary hover:underline underline-offset-4">
        Build your own →
      </ProjectLink>
    </div>
  ) : null

  return (
    <Page title="Overview" description="A starter view auto-built from your events" actions={pageActions}>
      {loading && !schema ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LayoutDashboard className="mb-4 size-10 opacity-15" />
          <p className="mb-1 text-sm font-medium">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchSchema()}>
            Retry
          </Button>
        </div>
      ) : hasEvents ? (
        <AnalyticsMode globalTimeRange={globalTimeRange} globalGranularity={tileGranularityOverride} />
      ) : (
        <SetupMode project={project} />
      )}
    </Page>
  )
}

export default Overview
