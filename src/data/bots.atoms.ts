import { atomWithDefault } from 'jotai/utils'
import { readIncludeBotsParam } from '@/hooks/use-filter-query-params'

// One setting across Events, Live and the profiles list, because each runs its own query and moving
// between them must not silently re-hide traffic you asked to see. A profile's own pages opt out and
// always read bots in — you are looking at that one person. Insights/Overview/Dashboards take the server's
// exclude-by-default and offer no toggle. The URL seeds this but is read once per store, never
// subscribed — an in-app link carrying `bots=1` would be overwritten, so don't build one.
export const includeBotsAtom = atomWithDefault(() => readIncludeBotsParam())
