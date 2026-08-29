import { atomWithDefault } from 'jotai/utils'
import { readIncludeBotsParam } from '@/hooks/use-filter-query-params'

// One setting across Events, Live and the profile tabs: the profile shell owns the control while its
// tabs each run their own query, and moving between pages must not silently re-hide traffic you asked
// to see. The URL seeds it but is read once per store, never subscribed — an in-app link carrying
// `bots=1` would be overwritten by the current value, so don't build one.
export const includeBotsAtom = atomWithDefault(() => readIncludeBotsParam())
