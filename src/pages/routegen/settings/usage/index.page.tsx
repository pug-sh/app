import { useAtomValue } from 'jotai'
import { CalendarRange, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { trackFeature } from '@/analytics/pug'
import type { GetUsageResponse } from '@/api/genproto/dashboard/usage/v1/usage_pb'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { usageRPCAtom } from '@/api/rpc'
import LoadingSpinner from '@/components/loading-spinner'
import { OptionChip } from '@/components/option-chip'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { resolvedThemeAtom } from '@/data/theme.atoms'
import { activeOrgAtom, projectsAtom } from '@/data/workspace.atoms'
import { rpcErrorMessage, toastRPCError } from '@/lib/rpc-error'
import { toProtoTimeRange, tsToDate } from '@/lib/timestamp'
import { BarChart } from '../../insights/charts/bar-chart'
import ProjectBreakdown from './project-breakdown'
import {
  buildUsageSeries,
  DEFAULT_RANGE_DAYS,
  formatPeriod,
  formatUtcStamp,
  lastNUtcDays,
  RANGE_OPTIONS,
  usageSeriesColors,
} from './usage-helpers'

// The window a response was fetched with, carried alongside it: deriving the series from the
// picker instead would describe the new range with the old response for the whole round-trip.
type Loaded = { usage: GetUsageResponse; range: { from: Date; to: Date }; days: number }

const NO_RANGE = { from: new Date(0), to: new Date(0) }
const LOAD_FAILED = 'Failed to load usage'

const Usage = () => {
  const org = useAtomValue(activeOrgAtom)
  const projects = useAtomValue(projectsAtom)
  const usageRPC = useAtomValue(usageRPCAtom)
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  const [rangeDays, setRangeDays] = useState(DEFAULT_RANGE_DAYS)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)

  // Range changes and Retry both fire on top of the mount effect, so a superseded response would
  // otherwise paint a chart the axis disagrees with.
  const latestRequestRef = useRef(0)

  const load = useCallback(async () => {
    if (!org) {
      setError('No organization selected')
      return
    }
    const requestId = ++latestRequestRef.current
    // Read off the clock per call, not per mount, or a tab left open overnight refreshes into
    // yesterday's window and today's events can never arrive.
    const range = lastNUtcDays(rangeDays)
    setFetching(true)
    try {
      const resp = await usageRPC.getUsage({ orgId: org.id, range: toProtoTimeRange(range) })
      if (requestId !== latestRequestRef.current) return
      setLoaded({ usage: resp, range, days: rangeDays })
      setError(null)
    } catch (err) {
      if (requestId !== latestRequestRef.current) return
      // Keeps `loaded`: a flaky refresh should leave the data on screen, not drop the reader back
      // to a bare error page whose only control retries the query that just failed.
      setError(rpcErrorMessage(err, LOAD_FAILED))
      toastRPCError(err, LOAD_FAILED)
    } finally {
      if (requestId === latestRequestRef.current) setFetching(false)
    }
  }, [usageRPC, org, rangeDays])

  useEffect(() => {
    load()
  }, [load])

  // Tracked here rather than in load(), which also runs on mount and on every range change. Named
  // explicitly since an icon-only button autocaptures as tag `svg` with no text.
  const refresh = () => {
    trackFeature({ featureId: 'usage.refresh', featureName: 'Refresh usage' })
    load()
  }

  const projectName = useCallback(
    (id: string) => projects.find(p => p.id === id)?.displayName ?? `${id.slice(0, 8)}…`,
    [projects],
  )

  const series = useMemo(
    () => buildUsageSeries(loaded?.usage.daily ?? [], loaded?.range ?? NO_RANGE, projectName),
    [loaded, projectName],
  )
  // resolvedTheme: getIndexedColor reads a module-level scheme the theme toggle mutates, which
  // can't invalidate a memo on its own.
  const seriesColors = useMemo(() => usageSeriesColors(series.names.length), [series.names.length, resolvedTheme])

  if (!loaded) {
    if (!error) return <LoadingSpinner />
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="mb-1 text-sm font-medium">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={load} disabled={fetching}>
          Try again
        </Button>
      </div>
    )
  }

  // usedEvents is a plain int64 that reads 0 when absent, and the two fields are set together or
  // not at all — so the stamp, never the count, decides whether there is an answer.
  const meteredAt = tsToDate(loaded.usage.usageComputedAt)
  const periodStart = tsToDate(loaded.usage.periodStart)
  const periodEnd = tsToDate(loaded.usage.periodEnd)

  return (
    <div className="space-y-8 max-w-4xl">
      {error && <p className="text-xs text-negative">{error} — showing the last data that loaded.</p>}
      <section>
        <SectionHeader
          title="Events this period"
          description="Distinct events recorded across every project in this organization. Counted in UTC, so days and periods here won't line up with a project reporting in another timezone."
        />

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {meteredAt ? (
            <span className="text-4xl tabular-nums">{loaded.usage.usedEvents.toLocaleString()}</span>
          ) : (
            <span className="text-4xl text-muted-foreground">Unknown</span>
          )}
          {periodStart && periodEnd && (
            <span className="text-xs text-muted-foreground">{formatPeriod(periodStart, periodEnd)}</span>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {meteredAt ? (
            <>Last metered {formatUtcStamp(meteredAt)}</>
          ) : (
            <>Usage has never been metered for this organization, so there is no count to show — not a zero.</>
          )}
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Daily events</span>
          <div className="flex items-center gap-2">
            <OptionChip
              label="range"
              icon={CalendarRange}
              options={RANGE_OPTIONS}
              value={rangeDays}
              onChange={days => {
                setRangeDays(days)
                trackFeature({ featureId: 'usage.range', featureName: 'Usage range' })
              }}
            />
            <Button variant="ghost" size="sm" onClick={refresh} disabled={fetching} aria-label="Refresh usage">
              <RefreshCw className={fetching ? 'size-3.5 animate-spin' : 'size-3.5'} />
            </Button>
          </div>
        </div>

        {series.projectTotals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm font-medium mb-1">No metered events in this window</p>
            <p className="text-xs">A day with no events is stored as no row at all.</p>
          </div>
        ) : (
          <>
            <BarChart
              data={series.points}
              seriesNames={series.names}
              seriesColors={seriesColors}
              granularity={Granularity.DAY}
              timeZone="UTC"
              stacked
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {series.windowTotal.toLocaleString()} events over the last {loaded.days} days — a different window from
              the period total above.
            </p>
          </>
        )}
      </section>

      <ProjectBreakdown
        projectTotals={series.projectTotals}
        windowTotal={series.windowTotal}
        chartedCount={series.chartedCount}
        colors={seriesColors}
      />
    </div>
  )
}

export default Usage
