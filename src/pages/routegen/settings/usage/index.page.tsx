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
import { activeOrgAtom, projectsAtom, projectsLoadedAtom } from '@/data/workspace.atoms'
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
  unmeteredTailDays,
  usageSeriesColors,
  validDate,
} from './usage-helpers'

// The window a response was fetched with, carried alongside it: deriving the series from the
// picker instead would describe the new range with the old response for the whole round-trip.
type Loaded = { usage: GetUsageResponse; range: { from: Date; to: Date }; days: RangeDays }

// An empty half-open window, so buildUsageSeries's day loop never runs and every field comes back
// empty whatever the response holds. Only read while `loaded` is null — the series memo sits above
// the early return, so it has to be given something.
const NO_RANGE = { from: new Date(0), to: new Date(0) }
const LOAD_FAILED = 'Failed to load usage'

// Connect applies no deadline of its own, so without this a stalled socket leaves the promise
// pending and the page on a bare spinner with nothing to retry. Surfaces as DeadlineExceeded.
const LOAD_TIMEOUT_MS = 20_000

const EMPTY_STATE_CLASS = 'flex flex-col items-center justify-center py-16 text-muted-foreground'

// Three answers the proto distinguishes and this page must not flatten into one (usage.proto, on
// usage_computed_at): no stamp at all means the meter has never run for this org; a stamp EARLIER
// than period_start means it has not reached this period yet, so used_events is a placeholder zero
// rather than a measurement, and the proto says to render it as "computing"; only a stamp inside
// the period makes the number a total. Rendering either of the first two as "0" states a billing
// figure the server never claimed. The fourth case is ours rather than the proto's — a negative
// total is not a number this page will put on screen.
type PeriodState =
  | { kind: 'never' }
  | { kind: 'unreadable'; meteredAt: Date }
  | { kind: 'computing'; meteredAt: Date }
  | { kind: 'metered'; meteredAt: Date }

const periodState = (usedEvents: bigint, meteredAt: Date | null, periodStart: Date | null): PeriodState => {
  if (!meteredAt) return { kind: 'never' }
  if (usedEvents < 0n) return { kind: 'unreadable', meteredAt }
  if (periodStart && meteredAt < periodStart) return { kind: 'computing', meteredAt }
  return { kind: 'metered', meteredAt }
}

const PeriodTotal = ({ state, usedEvents }: { state: PeriodState; usedEvents: bigint }) => {
  if (state.kind === 'metered') {
    return <span className="text-4xl tabular-nums">{usedEvents.toLocaleString()}</span>
  }
  if (state.kind === 'computing') {
    return <span className="text-4xl text-muted-foreground">Computing</span>
  }
  return <span className="text-4xl text-muted-foreground">Unknown</span>
}

const PeriodNote = ({ state }: { state: PeriodState }) => {
  if (state.kind === 'never') {
    return <>Usage has never been metered for this organization, so there is no count to show — not a zero.</>
  }
  if (state.kind === 'unreadable') {
    return (
      <>
        The server reported a negative total for this period, so there is no count to show — not a zero. Last metered{' '}
        {formatUtcStamp(state.meteredAt)}.
      </>
    )
  }
  if (state.kind === 'computing') {
    return (
      <>
        The meter has not reached this period yet, so there is no total for it — not a zero. Last metered{' '}
        {formatUtcStamp(state.meteredAt)}.
      </>
    )
  }
  return <>Last metered {formatUtcStamp(state.meteredAt)}</>
}

// Refused rows are reported, never folded into the "no events" state: this is a metering surface,
// and a page that says zero when the server said something else is worse than one that admits it
// could not read the answer.
const EmptyWindow = ({ malformed, outOfWindow }: { malformed: number; outOfWindow: number }) => {
  const unusable = malformed + outOfWindow
  if (unusable > 0) {
    return (
      <div className={EMPTY_STATE_CLASS}>
        <p className="text-sm font-medium mb-1">Usage could not be read for this window</p>
        <p className="text-xs">
          {unusable === 1 ? '1 row was' : `${unusable} rows were`} unusable, so there is no total to show — not a zero.
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

// Reported next to the totals they actually affect, rather than at the top of the page: `malformed`
// and `outOfWindow` describe the daily series only, and the period figure above comes from a
// different field entirely.
const RejectedRows = ({ malformed, outOfWindow }: { malformed: number; outOfWindow: number }) => (
  <>
    {malformed > 0 && (
      <p className="mb-2 text-xs text-caution">
        {malformed === 1 ? '1 usage row' : `${malformed} usage rows`} could not be read and{' '}
        {malformed === 1 ? 'is' : 'are'} missing from the totals below.
      </p>
    )}
    {outOfWindow > 0 && (
      <p className="mb-2 text-xs text-caution">
        {outOfWindow === 1 ? '1 usage row' : `${outOfWindow} usage rows`} fell outside the requested window and{' '}
        {outOfWindow === 1 ? 'is' : 'are'} missing from the totals below.
      </p>
    )}
  </>
)

const Usage = () => {
  const org = useAtomValue(activeOrgAtom)
  const projects = useAtomValue(projectsAtom)
  const projectsLoaded = useAtomValue(projectsLoadedAtom)
  const usageRPC = useAtomValue(usageRPCAtom)
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  const [rangeDays, setRangeDays] = useState<RangeDays>(DEFAULT_RANGE_DAYS)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)

  // Range changes, Refresh and Retry all fire on top of the mount effect. Without this a superseded
  // response wins the race and paints a window the range chip no longer names — and its `finally`
  // clears the spinner while the current request is still running.
  const latestRequestRef = useRef(0)

  const load = useCallback(async () => {
    // Claimed before any early return below, so a request already in flight can never still count
    // as the latest and paint its numbers over this one's error.
    const requestId = ++latestRequestRef.current
    if (!org?.id) {
      setError('No organization selected')
      // Bumping the id above orphaned any in-flight `finally`, so clear the flag here instead.
      setFetching(false)
      return
    }
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

  // "Unknown project" asserts deleted, which is wrong for the far more common case: this page can
  // mount before App's project fetch has run, and every row would accuse the org of deleting
  // projects it still has. projectsLoadedAtom is the only thing that tells the two apart.
  const projectName = useCallback(
    (id: string) => {
      const known = projects.find(p => p.id === id)?.displayName
      if (known) return known
      if (!projectsLoaded) return `Project ${id.slice(0, 8)}…`
      return `Unknown project (${id.slice(0, 8)}…)`
    },
    [projects, projectsLoaded],
  )

  const series = useMemo(
    () => buildUsageSeries(loaded?.usage.daily ?? [], loaded?.range ?? NO_RANGE, projectName),
    [loaded, projectName],
  )

  // A response the page cannot fully read is a server-side defect worth a line in the console, not
  // just a banner — the reader can report the count, but only this names the org and the rows.
  useEffect(() => {
    if (series.malformed === 0 && series.outOfWindow === 0) return
    console.error(
      `usage: ${series.malformed} unreadable and ${series.outOfWindow} out-of-window cell(s) in response for org ${org?.id ?? 'unknown'}`,
      series.rejected,
    )
  }, [series.malformed, series.outOfWindow, series.rejected, org])

  // resolvedTheme: getIndexedColor reads a module-level scheme the theme toggle mutates, which
  // can't invalidate a memo on its own.
  const seriesColors = useMemo(() => usageSeriesColors(series.names), [series.names, resolvedTheme])

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

  const meteredAt = validDate(tsToDate(loaded.usage.usageComputedAt))
  const periodStart = validDate(tsToDate(loaded.usage.periodStart))
  const periodEnd = validDate(tsToDate(loaded.usage.periodEnd))
  const period = periodState(loaded.usage.usedEvents, meteredAt, periodStart)
  const unmeteredDays = unmeteredTailDays(loaded.range, meteredAt)

  return (
    <div className="space-y-8 max-w-4xl">
      {error && <p className="text-xs text-negative">{error} — showing the last data that loaded.</p>}
      <section>
        <SectionHeader
          title="Events this period"
          description="Distinct events recorded across every project in this organization. Counted in UTC, so days and periods here won't line up with a project reporting in another timezone."
        />

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <PeriodTotal state={period} usedEvents={loaded.usage.usedEvents} />
          {periodStart && periodEnd && (
            <span className="text-xs text-muted-foreground">{formatPeriod(periodStart, periodEnd)}</span>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          <PeriodNote state={period} />
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Daily events</span>
          <div className="flex items-center gap-2">
            {/* Driven by the window on screen, not the pending pick — a chip naming a range the
                numbers beneath it didn't come from is the same lie `Loaded.days` exists to prevent.
                It catches up when the response lands, and never moves if the request fails. */}
            <OptionChip
              label="range"
              icon={CalendarRange}
              options={RANGE_OPTIONS}
              value={loaded.days}
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

        <RejectedRows malformed={series.malformed} outOfWindow={series.outOfWindow} />

        {series.projectTotals.length === 0 ? (
          <EmptyWindow malformed={series.malformed} outOfWindow={series.outOfWindow} />
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
            {unmeteredDays > 0 && meteredAt && (
              <p className="mt-2 text-xs text-caution">
                The meter last ran {formatUtcStamp(meteredAt)}, so the last{' '}
                {unmeteredDays === 1 ? 'day' : `${unmeteredDays} days`} of this chart{' '}
                {unmeteredDays === 1 ? 'is' : 'are'} unmetered — not zero.
              </p>
            )}
          </>
        )}
      </section>

      <ProjectBreakdown projectTotals={series.projectTotals} windowTotal={series.windowTotal} colors={seriesColors} />
    </div>
  )
}

export default Usage
