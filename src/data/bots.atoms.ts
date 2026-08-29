import { atomWithDefault } from 'jotai/utils'
import { readIncludeBotsParam } from '@/hooks/use-filter-query-params'

// One setting across every raw-event surface — Events, Live, the profiles list and the profile tabs —
// because each runs its own query and moving between them must not silently re-hide traffic you asked
// to see. Insights/Overview/Dashboards are deliberately outside it: they take the server's
// exclude-by-default and offer no toggle. The URL seeds this but is read once per store, never
// subscribed — an in-app link carrying `bots=1` would be overwritten, so don't build one.
export const includeBotsAtom = atomWithDefault(() => readIncludeBotsParam())
