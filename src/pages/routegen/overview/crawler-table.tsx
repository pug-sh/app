import { timestampDate } from '@bufbuild/protobuf/wkt'
import { useAtomValue } from 'jotai'
import { AlertTriangle, Bot, ShieldAlert } from 'lucide-react'
import { useMemo } from 'react'
import type { Granularity, TrendSeries } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { DomainFavicon } from '@/components/domain-favicon'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { activeProjectTimezoneAtom } from '@/data/workspace.atoms'
import {
  CRAWLER_CATEGORY_PROPERTY,
  CRAWLER_COMPANY_PROPERTY,
  CRAWLER_NAME_PROPERTY,
  CRAWLER_VERIFIED_PROPERTY,
  STATUS_CODE_PROPERTY,
} from '@/lib/crawlers'
import { compactNumber } from '@/lib/format'
import { propertyValueLabel } from '@/lib/property-values'
import { cn } from '@/lib/utils'
import { Sparkline } from '../dashboards/kpi-tile'
import { formatTooltipDate } from '../insights/charts/helpers'
import { buildChartData } from '../insights/helpers'
import { crawlerOperator } from './crawler-operators'
import { buildCrawlerAgentsQuery, buildCrawlerChecksQuery, buildCrawlerErrorsQuery } from './crawler-queries'
import { OverviewTileShell } from './overview-tile-shell'
import { PanelBody } from './traffic-breakdown-panel'
import { filtersExcept, hasFilter } from './traffic-filters'
import { useTrafficQuery } from './use-traffic-query'

const OTHERS = '$others'
const FAILED_HINT = "Requests that named a crawler but were reported from an address its operator doesn't publish"

const errorKind = (status: number) => {
  if (status === 401 || status === 403) return 'refused'
  if (status === 404 || status === 410) return 'not found'
  if (status === 429) return 'rate limited'
  if (status >= 500) return 'server errors'
  return 'other errors'
}

type ErrorCount = { status: string; count: number }

const total = (series: TrendSeries) => series.points.reduce((sum, point) => sum + point.value, 0)

const summarizeErrors = (errors: ErrorCount[]) => {
  const byKind = new Map<string, number>()
  for (const { status, count } of errors) {
    const kind = errorKind(Number(status))
    byKind.set(kind, (byKind.get(kind) ?? 0) + count)
  }
  return [...byKind]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${compactNumber(count)} ${kind}`)
    .join(' · ')
}

const lastActiveLabel = (series: TrendSeries, granularity: Granularity, timeZone: string) => {
  const time = series.points.findLast(point => point.value > 0)?.time
  return time ? formatTooltipDate(timestampDate(time), granularity, timeZone) : null
}

const OperatorLogo = ({ domain }: { domain?: string }) => {
  if (domain) return <DomainFavicon domain={domain} />
  return <Bot aria-hidden size={16} className="shrink-0 text-muted-foreground/60" />
}

type Activity = { requests: number; trend: { value: number }[]; lastActive: string | null }

const ActivityCells = ({ requests, trend, lastActive }: Activity) => (
  <>
    <td className="py-1.5 pr-3 text-right tabular-nums">{compactNumber(requests)}</td>
    <td className="py-1.5 pr-3">
      <div aria-hidden className="h-5 w-24 text-muted-foreground/60">
        {trend.length >= 2 && <Sparkline points={trend} baseline="zero" strokeWidth={1.25} />}
      </div>
    </td>
    <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums text-muted-foreground">{lastActive}</td>
  </>
)

export const CrawlerTable = ({
  range,
  granularity,
  filters,
  reportsStatusCodes,
  onAddFilter,
}: {
  range: TimeRange
  granularity: Granularity
  filters: readonly ActiveFilter[]
  reportsStatusCodes: boolean
  onAddFilter: (property: string, value: string) => void
}) => {
  const timeZone = useAtomValue(activeProjectTimezoneAtom)

  // Every crawler stays listed while one is selected, so it can be picked or toggled off.
  const queryFilters = useMemo(() => filtersExcept(filters, CRAWLER_NAME_PROPERTY), [filters])
  const agentsQuery = useMemo(() => buildCrawlerAgentsQuery(queryFilters), [queryFilters])
  const errorsQuery = useMemo(() => buildCrawlerErrorsQuery(queryFilters), [queryFilters])
  const checksQuery = useMemo(() => buildCrawlerChecksQuery(queryFilters), [queryFilters])
  const agents = useTrafficQuery(agentsQuery, range, granularity, 'overview-crawlers-agents')
  const errors = useTrafficQuery(errorsQuery, range, granularity, 'overview-crawlers-errors')
  const checks = useTrafficQuery(checksQuery, range, granularity, 'overview-crawlers-checks')

  const errorsByAgent = useMemo(() => {
    const byAgent = new Map<string, ErrorCount[]>()
    if (errors.result.case !== 'trends') return byAgent
    for (const series of errors.result.value.series) {
      const agent = series.breakdown[CRAWLER_NAME_PROPERTY] ?? ''
      const status = series.breakdown[STATUS_CODE_PROPERTY] ?? ''
      if (agent === OTHERS || !status) continue
      byAgent.set(agent, [...(byAgent.get(agent) ?? []), { status, count: total(series) }])
    }
    return byAgent
  }, [errors.result])

  const groups = useMemo(() => {
    const answered = agents.answered
    if (answered?.result.case !== 'trends') return []
    const grid = buildChartData(answered.result.value.series, answered.granularity, timeZone, answered.fillRange)
    const rows = answered.result.value.series.map((series, index) => {
      const agent = series.breakdown[CRAWLER_NAME_PROPERTY] ?? ''
      const company = series.breakdown[CRAWLER_COMPANY_PROPERTY] ?? ''
      const others = agent === OTHERS
      return {
        agent,
        others,
        operator: others ? { name: 'Other crawlers' } : crawlerOperator(agent, company),
        purpose: others ? '' : (series.breakdown[CRAWLER_CATEGORY_PROPERTY] ?? ''),
        requests: total(series),
        trend: grid.map(point => ({ value: point.values[index] })),
        lastActive: lastActiveLabel(series, answered.granularity, timeZone),
      }
    })
    const byOperator = new Map<string, typeof rows>()
    for (const row of rows) byOperator.set(row.operator.name, [...(byOperator.get(row.operator.name) ?? []), row])
    const requests = (group: typeof rows) => group.reduce((sum, row) => sum + row.requests, 0)
    return [...byOperator.values()]
      .map(members => members.sort((a, b) => b.requests - a.requests))
      .sort((a, b) => {
        if (a[0].others !== b[0].others) return a[0].others ? 1 : -1
        return requests(b) - requests(a)
      })
  }, [agents.answered, timeZone])

  // Behind a CDN even real crawlers fail their check, so one passing anywhere on the site rules a CDN out.
  const failed = useMemo(() => {
    const answered = checks.answered
    if (answered?.result.case !== 'trends') return undefined
    const verdicts = answered.result.value.series
    const series = verdicts.find(candidate => candidate.breakdown[CRAWLER_VERIFIED_PROPERTY] === 'failed')
    if (!series) return undefined
    const grid = buildChartData([series], answered.granularity, timeZone, answered.fillRange)
    const passed = verdicts.some(candidate => candidate.breakdown[CRAWLER_VERIFIED_PROPERTY] === 'verified')
    return {
      requests: total(series),
      trend: grid.map(point => ({ value: point.values[0] })),
      lastActive: lastActiveLabel(series, answered.granularity, timeZone),
      cdnSuspected: !passed && queryFilters.length === 0,
    }
  }, [checks.answered, queryFilters, timeZone])

  // A blank cell says "no errors", so it's only drawn once errors are known. Past the query's limit, a crawler with
  // none listed may still have some in the overflow, and other crawlers' errors are listed under their own names.
  const errorsKnown = reportsStatusCodes && errors.answered !== undefined
  const errorsOverflow =
    errors.result.case === 'trends' &&
    errors.result.value.series.some(series => series.breakdown[CRAWLER_NAME_PROPERTY] === OTHERS)
  const emptyUnknown = agents.answered !== undefined && groups.length === 0 && checks.answered === undefined
  const detailsFailed = (reportsStatusCodes && !!errors.error) || !!checks.error
  const retryDetails = () => {
    if (errors.error) errors.retry()
    if (checks.error) checks.retry()
  }
  let footer = 'requests by crawler, grouped by company · click a crawler to filter'
  if (!reportsStatusCodes) footer += ' · no status codes reported'

  let body
  if (groups.length === 0 && !failed) {
    body = (
      <p className="flex h-40 items-center justify-center text-xs text-faint">No crawler requests in this period</p>
    )
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
              <th className="py-1.5 pr-3 font-medium">Company</th>
              <th className="py-1.5 pr-3 font-medium">Crawler</th>
              <th className="py-1.5 pr-3 font-medium">Purpose</th>
              <th className="py-1.5 pr-3 text-right font-medium">Requests</th>
              <th className="w-24 py-1.5 pr-3 font-medium">
                <span className="sr-only">Trend</span>
              </th>
              <th className="py-1.5 pr-3 font-medium">Last active</th>
              <th className="py-1.5 font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group =>
              group.map((row, index) => {
                const active = !row.others && hasFilter(filters, CRAWLER_NAME_PROPERTY, row.agent)
                const agentErrors = errorsByAgent.get(row.agent) ?? []
                const errorsUnknown = !errorsKnown || row.others || (errorsOverflow && agentErrors.length === 0)
                return (
                  <tr
                    key={`${row.agent}\u0000${row.purpose}`}
                    className={cn(
                      'transition-colors hover:bg-muted/40',
                      index === group.length - 1 && 'border-b border-border/50',
                      active && 'bg-primary/10 dark:bg-primary/20',
                    )}
                  >
                    <td className="py-1.5 pr-3">
                      {index === 0 && (
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <OperatorLogo domain={row.others ? undefined : row.operator.domain} />
                          <span className={cn(row.others && 'text-muted-foreground')}>{row.operator.name}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      {row.others ? null : (
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => onAddFilter(CRAWLER_NAME_PROPERTY, row.agent)}
                          className={cn(
                            'text-left font-mono hover:underline underline-offset-4',
                            active && 'font-medium',
                          )}
                        >
                          {row.agent}
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                      {row.purpose ? propertyValueLabel(CRAWLER_CATEGORY_PROPERTY, row.purpose) : null}
                    </td>
                    <ActivityCells requests={row.requests} trend={row.trend} lastActive={row.lastActive} />
                    <td
                      className={cn(
                        'py-1.5 whitespace-nowrap',
                        errorsUnknown ? 'text-muted-foreground' : 'text-negative',
                      )}
                      title={agentErrors.map(error => `${error.status}: ${error.count}`).join(', ') || undefined}
                    >
                      {errorsUnknown ? '–' : summarizeErrors(agentErrors)}
                    </td>
                  </tr>
                )
              }),
            )}
            {failed && (
              <tr className="border-b border-border/50 transition-colors hover:bg-muted/40">
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-2 whitespace-nowrap text-muted-foreground" title={FAILED_HINT}>
                    <ShieldAlert aria-hidden size={16} className="shrink-0 text-muted-foreground/60" />
                    {propertyValueLabel(CRAWLER_VERIFIED_PROPERTY, 'failed')}
                  </span>
                </td>
                <td colSpan={2} />
                <ActivityCells requests={failed.requests} trend={failed.trend} lastActive={failed.lastActive} />
                <td className="py-1.5 whitespace-nowrap text-muted-foreground">–</td>
              </tr>
            )}
          </tbody>
        </table>
        {detailsFailed && (
          <p className="mt-2 text-xs text-muted-foreground">
            Couldn't load error counts or IP checks.{' '}
            <button type="button" onClick={retryDetails} className="text-link hover:underline underline-offset-4">
              Retry
            </button>
          </p>
        )}
        {failed?.cdnSuspected && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-caution">
            <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
            Every IP check failed: behind a CDN, your server may be seeing the CDN's address, not the crawler's
          </p>
        )}
      </div>
    )
  }

  return (
    <OverviewTileShell title="Who reads your site" footer={footer}>
      <PanelBody
        error={agents.error ?? (emptyUnknown ? checks.error : null)}
        retry={agents.error ? agents.retry : checks.retry}
        pending={agents.answered === undefined || emptyUnknown}
        className="h-40"
      >
        {body}
      </PanelBody>
    </OverviewTileShell>
  )
}
