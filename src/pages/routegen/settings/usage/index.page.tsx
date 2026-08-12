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
import { compactNumber } from '@/lib/format'
import { toastRPCError } from '@/lib/rpc-error'
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

type Result = { usage: GetUsageResponse; error: null } | { usage: null; error: string }

const Usage = () => {
  const org = useAtomValue(activeOrgAtom)
  const projects = useAtomValue(projectsAtom)
  const usageRPC = useAtomValue(usageRPCAtom)
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  const [rangeDays, setRangeDays] = useState<number>(DEFAULT_RANGE_DAYS)
  const [result, setResult] = useState<Result | null>(null)
  const [fetching, setFetching] = useState(false)

  // Range changes and Retry both fire on top of the mount effect, so a superseded response would
  // otherwise paint a chart the axis disagrees with.
  const latestRequestRef = useRef(0)

  // `to` comes off the clock, so a fresh object per render would re-run the fetch effect forever.
  const range = useMemo(() => lastNUtcDays(rangeDays), [rangeDays])

  const load = useCallback(async () => {
    if (!org) return
    const requestId = ++latestRequestRef.current
    setFetching(true)
    try {
      const resp = await usageRPC.getUsage({ orgId: org.id, range: toProtoTimeRange(range) })
      if (requestId !== latestRequestRef.current) return
      setResult({ usage: resp, error: null })
    } catch (err) {
      if (requestId !== latestRequestRef.current) return
      const fallback = 'Failed to load usage'
      setResult({ usage: null, error: fallback })
      toastRPCError(err, fallback)
    } finally {
      if (requestId === latestRequestRef.current) setFetching(false)
    }
  }, [usageRPC, org, range])

  useEffect(() => {
    load()
  }, [load])

  const projectName = useCallback(
    (id: string) => projects.find(p => p.id === id)?.displayName ?? `${id.slice(0, 8)}…`,
    [projects],
  )

  const usage = result?.usage ?? null
  const series = useMemo(() => buildUsageSeries(usage?.daily ?? [], range, projectName), [usage, range, projectName])
  // resolvedTheme: getIndexedColor reads a module-level scheme the theme toggle mutates, which
  // can't invalidate a memo on its own.
  const seriesColors = useMemo(() => usageSeriesColors(series.names.length), [series.names.length, resolvedTheme])

  // usedEvents is a plain int64 that reads 0 when absent, and the two fields are set together or
  // not at all — so the stamp, never the count, decides whether there is an answer.
  const meteredAt = tsToDate(usage?.usageComputedAt)
  const periodStart = tsToDate(usage?.periodStart)
  const periodEnd = tsToDate(usage?.periodEnd)

  if (!result) return <LoadingSpinner />

  if (result.error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="mb-1 text-sm font-medium">{result.error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={load}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <section>
        <SectionHeader
          title="Events this period"
          description="Distinct events recorded across every project in this organization. Counted in UTC, so days and periods here won't line up with a project reporting in another timezone."
        />

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {meteredAt ? (
            <span className="text-4xl tabular-nums">{Number(usage?.usedEvents ?? 0n).toLocaleString()}</span>
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
            <Button variant="ghost" size="sm" onClick={load} disabled={fetching} aria-label="Refresh usage">
              <RefreshCw className={fetching ? 'size-3.5 animate-spin' : 'size-3.5'} />
            </Button>
          </div>
        </div>

        {series.windowTotal === 0 ? (
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
              {compactNumber(series.windowTotal)} events over the last {rangeDays} days — a different window from the
              period total above.
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
