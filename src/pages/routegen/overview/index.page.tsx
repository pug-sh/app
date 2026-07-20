import { useAtom, useAtomValue, useSetAtom } from 'jotai'
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
import { clampGranularity, clampRange, granularityDisabledReason, resolveTileGranularity } from '@/lib/granularity'
import { GRANULARITIES } from '../insights/constants'
import { OptionChip } from '../insights/controls'
import AnalyticsMode from './analytics-mode'
import {
  fetchOverviewSchemaAtom,
  overviewModeAtom,
  overviewSchemaAtom,
  overviewSchemaErrorAtom,
  overviewSchemaLoadingAtom,
} from './overview.atoms'
import SetupMode from './setup-mode'
import { type OverviewMode, readWebStat, resolveWebDefaultRange, writeWebStatParam } from './url-state'
import WebAnalyticsMode from './web-analytics-mode'

const GLOBAL_GRANULARITIES = [{ label: 'Auto', value: Granularity.UNSPECIFIED }, ...GRANULARITIES] as const

const MODE_OPTIONS = [
  { label: 'Web analytics', value: 'web' },
  { label: 'Product analytics', value: 'product' },
] as const satisfies readonly { label: string; value: OverviewMode }[]

const Overview = () => {
  const project = useAtomValue(activeProjectAtom)
  const schema = useAtomValue(overviewSchemaAtom)
  const loading = useAtomValue(overviewSchemaLoadingAtom)
  const error = useAtomValue(overviewSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchOverviewSchemaAtom)

  const initialOverrides = useMemo(() => readTimeGranularityQueryParams(), [])
  const [mode, setMode] = useAtom(overviewModeAtom)
  const [webStat, setWebStat] = useState(() => readWebStat())
  // Web analytics lands on Today when no window is pinned; product analytics keeps its
  // "no explicit window" default (tiles fall back to their own ranges). The persisted mode reads
  // synchronously here (overviewModeAtom uses getOnInit), so this initial window matches the
  // restored view on the very first render.
  const [globalTimeRange, setGlobalTimeRange] = useState<TimeRange | undefined>(
    () => initialOverrides.timeRange ?? (mode === 'web' ? resolveWebDefaultRange() : undefined),
  )
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

  useEffect(() => {
    writeWebStatParam(mode, webStat)
  }, [mode, webStat])

  // Switching into web analytics with no window pins Today, so the picker reflects the window the
  // panels actually query rather than showing "Select time" over live data.
  const handleModeChange = (next: OverviewMode) => {
    setMode(next)
    if (next === 'web' && !globalTimeRange) {
      const today = resolveWebDefaultRange()
      setGlobalTimeRange(today)
      setGlobalGranularity(g => clampGranularity(g, today))
    }
  }

  // Keep range and granularity backend-valid: cap a range too wide for any granularity, then
  // bump an explicit granularity that no longer fits to the finest that still fits (Auto stays Auto).
  const handleGlobalTimeRangeChange = (range: TimeRange | undefined) => {
    const clamped = clampRange(range)
    setGlobalTimeRange(clamped)
    setGlobalGranularity(g => clampGranularity(g, clamped))
  }

  if (!project) return <NoProject title="Overview" icon={LayoutDashboard} />

  const hasEvents = (schema?.events.length ?? 0) > 0
  const tileGranularityOverride = resolveTileGranularity(globalGranularity, globalTimeRange)

  // Web vs product analytics body, once the schema has loaded (the caller narrows it non-null).
  const renderAnalyticsBody = (loadedSchema: NonNullable<typeof schema>) =>
    mode === 'web' ? (
      <WebAnalyticsMode
        schema={loadedSchema}
        selectedStat={webStat}
        onSelectStat={setWebStat}
        globalTimeRange={globalTimeRange}
        globalGranularity={tileGranularityOverride}
      />
    ) : (
      <AnalyticsMode globalTimeRange={globalTimeRange} globalGranularity={tileGranularityOverride} />
    )

  const pageActions = hasEvents ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <OptionChip label="view" options={MODE_OPTIONS} value={mode} onChange={handleModeChange} />
      <DateRangePicker
        value={globalTimeRange}
        onChange={handleGlobalTimeRangeChange}
        allowUnset
        unsetLabel="Default range"
      />
      <OptionChip
        label="granularity"
        icon={Clock}
        options={GLOBAL_GRANULARITIES}
        value={globalGranularity}
        onChange={setGlobalGranularity}
        isOptionDisabled={v => granularityDisabledReason(v, globalTimeRange)}
      />
      <ProjectLink href="/dashboards" className="ml-1 text-xs text-link hover:underline underline-offset-4">
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
      ) : hasEvents && schema ? (
        renderAnalyticsBody(schema)
      ) : (
        <SetupMode project={project} />
      )}
    </Page>
  )
}

export default Overview
