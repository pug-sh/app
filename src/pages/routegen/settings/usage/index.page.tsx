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
import { BarChart } from '../../insights/charts'
import ProjectBreakdown from './project-breakdown'
import {
  buildUsageSeries,
  DEFAULT_RANGE_DAYS,
  formatPeriod,
  formatUtcStamp,
  lastNUtcDays,
  RANGE_OPTIONS,
  type RangeDays,
  usageSeriesColors,
} from './usage-helpers'

// The window a response was fetched with, carried alongside it: deriving the series from the
// picker instead would describe the new range with the old response for the whole round-trip.
type Loaded = { usage: GetUsageResponse; range: { from: Date; to: Date }; days: number }

// An empty half-open window, so buildUsageSeries's day loop never runs and every field comes back
// empty whatever the response holds. Only read while `loaded` is null — the series memo sits above
// the early return, so it has to be given something.
const NO_RANGE = { from: new Date(0), to: new Date(0) }
const LOAD_FAILED = 'Failed to load usage'

// Connect applies no deadline of its own, so without this a stalled socket leaves the promise
// pending and the page on a bare spinner with nothing to retry. Surfaces as DeadlineExceeded.
const LOAD_TIMEOUT_MS = 20_000

const EMPTY_STATE_CLASS = 'flex flex-col items-center justify-center py-16 text-muted-foreground'

// Unreadable rows are reported, never folded into the "no events" state: this is a metering
// surface, and a page that says zero when the server said something else is worse than one that
// admits it could not read the answer.
const EmptyWindow = ({ malformed }: { malformed: number }) => {
  if (malformed > 0) {
    return (
      <div className={EMPTY_STATE_CLASS}>
        <p className="text-sm font-medium mb-1">Usage could not be read for this window</p>
        <p className="text-xs">
          {malformed === 1 ? '1 row was' : `${malformed} rows were`} unreadable, so there is no total to show — not a
          zero.
        </p>
      </div>
    )
  }
  return (
    <div className={EMPTY_STATE_CLASS}>
      <p className="text-sm font-medium mb-1">No metered events in this window</p>
      <p className="text-xs">A day with no events is stored as no row at all.</p>
    </div>
  )
}

const Usage = () => {
  const org = useAtomValue(activeOrgAtom)
  const projects = useAtomValue(projectsAtom)
  const usageRPC = useAtomValue(usageRPCAtom)
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  const [rangeDays, setRangeDays] = useState<RangeDays>(DEFAULT_RANGE_DAYS)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)

  // Range changes and Retry both fire on top of the mount effect. Without this a superseded
  // response wins the race and paints a window the range chip no longer names — and its `finally`
  // clears the spinner while the current request is still running.
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
    const protoRange = toProtoTimeRange(range)
    setFetching(true)

    // Only the call is guarded. Widen this and a programming error in the state updates below
    // reaches the reader as "Failed to load usage" — a network message, with a retry that cannot
    // fix it — instead of the error boundary.
    let resp: GetUsageResponse
    try {
      resp = await usageRPC.getUsage({ orgId: org.id, range: protoRange }, { timeoutMs: LOAD_TIMEOUT_MS })
    } catch (err) {
      if (requestId !== latestRequestRef.current) return
      // Keeps `loaded`: a flaky refresh should leave the data on screen, not drop the reader back
      // to a bare error page whose only control retries the query that just failed.
      setError(rpcErrorMessage(err, LOAD_FAILED))
      toastRPCError(err, LOAD_FAILED)
      return
    } finally {
      if (requestId === latestRequestRef.current) setFetching(false)
    }

    if (requestId !== latestRequestRef.current) return
    setLoaded({ usage: resp, range, days: rangeDays })
    setError(null)
  }, [usageRPC, org, rangeDays])

  useEffect(() => {
    load()
  }, [load])

  // trackFeature sits here rather than in load() because that also runs on mount and on every range
  // change; only this handler is a deliberate click. Named explicitly since an icon-only button
  // autocaptures as tag `svg` with no text.
  const refresh = () => {
    trackFeature({ featureId: 'usage.refresh', featureName: 'Refresh usage' })
    load()
  }

  // Labelled rather than bare, since the same fallback covers a deleted project and the window
  // before projectsAtom fills — when every row would otherwise be an unexplained id fragment.
  const projectName = useCallback(
    (id: string) => projects.find(p => p.id === id)?.displayName ?? `Unknown project (${id.slice(0, 8)}…)`,
    [projects],
  )

  const series = useMemo(
    () => buildUsageSeries(loaded?.usage.daily ?? [], loaded?.range ?? NO_RANGE, projectName),
    [loaded, projectName],
  )

  // A response the page cannot fully read is a server-side defect worth a line in the console, not
  // just a banner — the reader can report the count, but only this names the org.
  useEffect(() => {
    if (series.malformed > 0) {
      console.error(`usage: ${series.malformed} unreadable cell(s) in response for org ${org?.id ?? 'unknown'}`)
    }
  }, [series.malformed, org])
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

  // protobuf-es surfaces an absent used_events as 0n with no undefined to test, and the server sets
  // the two fields together or not at all — so the stamp, never the count, decides whether there is
  // an answer.
  const meteredAt = tsToDate(loaded.usage.usageComputedAt)
  const periodStart = tsToDate(loaded.usage.periodStart)
  const periodEnd = tsToDate(loaded.usage.periodEnd)

  return (
    <div className="space-y-8 max-w-4xl">
      {error && <p className="text-xs text-negative">{error} — showing the last data that loaded.</p>}
      {series.malformed > 0 && series.projectTotals.length > 0 && (
        <p className="text-xs text-caution">
          {series.malformed === 1 ? '1 usage row' : `${series.malformed} usage rows`} could not be read and{' '}
          {series.malformed === 1 ? 'is' : 'are'} missing from the totals below.
        </p>
      )}
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
          <EmptyWindow malformed={series.malformed} />
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

      <ProjectBreakdown projectTotals={series.projectTotals} windowTotal={series.windowTotal} colors={seriesColors} />
    </div>
  )
}

export default Usage
