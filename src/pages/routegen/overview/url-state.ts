import { replaceUrlIfChanged, setOrDelete } from '@/hooks/use-filter-query-params'
import { last24HoursRange } from '@/lib/date-presets'
import { isWebStatId, type WebStatId } from './web-analytics-queries'

// Overview-local URL state: in web mode, which stat drives the chart. The Web vs Product view mode is
// a persisted preference, not URL state — see overviewModeAtom in overview.atoms.ts. Kept out of the
// shared insights filter-params hook (that's for the Insights page's filter grammar) since this is
// specific to this page. Time range + granularity still ride the shared readTimeGranularityQueryParams
// helpers.
export type OverviewMode = 'web' | 'product'

const STAT_PARAM = 'stat'

const DEFAULT_WEB_STAT: WebStatId = 'users'

// The default landing window for web analytics: the last 24 hours, hour-bucketed (granularity
// resolves to HOUR from this range via autoGranularity). One line so the web default policy lives
// here while the range primitive stays in date-presets.
export const resolveWebDefaultRange = () => last24HoursRange()

export const readWebStat = (search = window.location.search) => {
  const raw = new URLSearchParams(search).get(STAT_PARAM)
  return isWebStatId(raw) ? raw : DEFAULT_WEB_STAT
}

// The stat only applies in web mode, so `mode` gates it: drop the param in product mode and when it's
// the default, keeping a shared link clean.
export const writeWebStatParam = (mode: OverviewMode, stat: WebStatId) => {
  const url = new URL(window.location.href)
  setOrDelete(url, STAT_PARAM, mode === 'web' && stat !== DEFAULT_WEB_STAT ? stat : undefined)
  replaceUrlIfChanged(url)
}
