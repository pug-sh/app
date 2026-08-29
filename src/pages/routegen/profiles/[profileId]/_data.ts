import { Code, ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import { atomWithRefresh } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { activityRPCAtom, profilesRPCAtom } from '@/api/rpc'
import { includeBotsAtom } from '@/data/bots.atoms'
import { projectHeaderAtom } from '@/data/workspace.atoms'

// A profile URL can carry either an external/distinct id (events + activity links resolve
// users by distinct id) or the internal profile id (the list links by it). Resolve by
// external id first, then fall back to the internal id.
//
// `null` resolves to "profile not found" — the shell renders an explicit empty state for it.
// Other RPC failures throw and bubble up to the router's error boundary.
const isNotFound = (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound

export const profileFamilyAtom = atomFamily((profileId: string) =>
  atom(async get => {
    const rpc = get(profilesRPCAtom)
    const headers = get(projectHeaderAtom)
    // Same tracking rule as profileStatsFamilyAtom below: read before the first await. The header's
    // counters come from here, so without it they'd contradict the bot-filtered tabs underneath.
    const includeBots = get(includeBotsAtom)
    if (!headers) return null

    try {
      const resp = await rpc.getByExternalId({ externalId: profileId, includeBots }, { headers })
      if (resp.profile) return resp.profile
    } catch (err) {
      if (!isNotFound(err)) throw err
    }

    try {
      const resp = await rpc.get({ id: profileId, includeBots }, { headers })
      return resp.profile ?? null
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }),
)

const isAuthError = (err: unknown) =>
  err instanceof ConnectError && (err.code === Code.Unauthenticated || err.code === Code.PermissionDenied)

// Decorative — a failure must not take down the page, but stays distinct from an empty response.
// Refreshable so the heatmap can retry; a plain derived atom would cache the failure for the session.
export const profileStatsFamilyAtom = atomFamily((profileId: string) =>
  atomWithRefresh(async get => {
    const rpc = get(activityRPCAtom)
    const headers = get(projectHeaderAtom)
    // Tracked as a dependency rather than keyed into the family, which would strand a cache entry
    // per profile per flag value. Must stay above the first await, or jotai stops tracking it.
    const includeBots = get(includeBotsAtom)
    if (!headers) return { resp: null, failed: true as const, error: null }
    try {
      const resp = await rpc.getProfileStats({ distinctId: profileId, includeBots }, { headers })
      return { resp, failed: false as const, error: null }
    } catch (err) {
      // Auth failures are session-wide, not a heatmap problem — let the boundary handle them.
      if (isAuthError(err)) throw err
      console.error('GetProfileStats failed; rendering the heatmap as unavailable:', err)
      return { resp: null, failed: true as const, error: err instanceof Error ? err.message : null }
    }
  }),
)
