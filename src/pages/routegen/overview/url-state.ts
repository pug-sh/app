import { replaceUrlIfChanged, setOrDelete } from '@/hooks/use-filter-query-params'
import { last24HoursRange } from '@/lib/date-presets'
import { isTrafficStatId, type TrafficStatId } from './traffic-queries'

// Overview-local URL state: in traffic mode, which stat drives the chart. The Traffic vs Product view
// mode is a persisted preference, not URL state — see overviewModeAtom in overview.atoms.ts. Kept out
// of the shared insights filter-params hook (that's for the Insights page's filter grammar) since this
// is specific to this page. Time range + granularity still ride the shared
// readTimeGranularityQueryParams helpers.
export type OverviewMode = 'traffic' | 'product'

const STAT_PARAM = 'stat'

const DEFAULT_TRAFFIC_STAT: TrafficStatId = 'users'

// The default landing window for both overview modes: the last 24 hours, hour-bucketed (granularity
// resolves to HOUR from this range via autoGranularity). One line so the default policy lives here
// while the range primitive stays in date-presets.
export const resolveOverviewDefaultRange = () => last24HoursRange()

export const readTrafficStat = (search = window.location.search) => {
  const raw = new URLSearchParams(search).get(STAT_PARAM)
  return isTrafficStatId(raw) ? raw : DEFAULT_TRAFFIC_STAT
}

// The stat only applies in traffic mode, so `mode` gates it: drop the param in product mode and when
// it's the default, keeping a shared link clean.
export const writeTrafficStatParam = (mode: OverviewMode, stat: TrafficStatId) => {
  const url = new URL(window.location.href)
  setOrDelete(url, STAT_PARAM, mode === 'traffic' && stat !== DEFAULT_TRAFFIC_STAT ? stat : undefined)
  replaceUrlIfChanged(url)
}
