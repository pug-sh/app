import { replaceUrlIfChanged, setOrDelete } from '@/hooks/use-filter-query-params'
import { todayRange } from '@/lib/date-presets'
import { isWebStatId, type WebStatId } from './web-analytics-queries'

// Overview-local URL state: which analytics view is shown and, in web mode, which stat drives the
// chart. Kept out of the shared insights filter-params hook (that's for the Insights page's filter
// grammar) since these two are specific to this page. Time range + granularity still ride the shared
// readTimeGranularityQueryParams helpers.
export type OverviewMode = 'web' | 'product'

const MODE_PARAM = 'view'
const STAT_PARAM = 'stat'

const DEFAULT_OVERVIEW_MODE: OverviewMode = 'web'
const DEFAULT_WEB_STAT: WebStatId = 'users'

// The default landing window for web analytics: today, hour-bucketed (granularity resolves to HOUR
// from this range via autoGranularity). One line so the web default policy lives here while the
// range primitive stays in date-presets.
export const resolveWebDefaultRange = () => todayRange()

// Annotated because the ternary's `'product'` branch would otherwise widen the inferred return to
// `string`.
export const readOverviewMode = (search = window.location.search): OverviewMode =>
  new URLSearchParams(search).get(MODE_PARAM) === 'product' ? 'product' : DEFAULT_OVERVIEW_MODE

export const readWebStat = (search = window.location.search) => {
  const raw = new URLSearchParams(search).get(STAT_PARAM)
  return isWebStatId(raw) ? raw : DEFAULT_WEB_STAT
}

export const writeOverviewUrlState = (mode: OverviewMode, stat: WebStatId) => {
  const url = new URL(window.location.href)
  // Keep the default view out of the URL so a shared link stays clean; only 'product' is explicit.
  setOrDelete(url, MODE_PARAM, mode === 'product' ? 'product' : undefined)
  // The stat only applies in web mode; drop it in product mode and when it's the default.
  setOrDelete(url, STAT_PARAM, mode === 'web' && stat !== DEFAULT_WEB_STAT ? stat : undefined)
  replaceUrlIfChanged(url)
}
