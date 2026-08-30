import { Code, ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import { atomWithRefresh } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { activityRPCAtom, profilesRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'

// A profile URL can carry either an external/distinct id (events + activity links resolve
// users by distinct id) or the internal profile id (the list links by it). Resolve by
// external id first, then fall back to the internal id.
//
// `null` resolves to "profile not found" — the shell renders an explicit empty state for it.
// Other RPC failures throw and bubble up to the router's error boundary.
const isNotFound = (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound

// Always on here, unlike the list: without it an anonymous crawler reads as "not found", and an
// identified one comes back with no activity summary at all — including the bot flag the header shows.
export const profileFamilyAtom = atomFamily((profileId: string) =>
  atom(async get => {
    const rpc = get(profilesRPCAtom)
    // Above the first await — jotai only tracks a dependency read synchronously.
    const headers = get(projectHeaderAtom)
    if (!headers) return null

    try {
      const resp = await rpc.getByExternalId({ externalId: profileId, includeBots: true }, { headers })
      if (resp.profile) return resp.profile
    } catch (err) {
      if (!isNotFound(err)) throw err
    }

    try {
      const resp = await rpc.get({ id: profileId, includeBots: true }, { headers })
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
    if (!headers) return { resp: null, failed: true as const, error: null }
    try {
      const resp = await rpc.getProfileStats({ distinctId: profileId, includeBots: true }, { headers })
      return { resp, failed: false as const, error: null }
    } catch (err) {
      // Auth failures are session-wide, not a heatmap problem — let the boundary handle them.
      if (isAuthError(err)) throw err
      console.error('GetProfileStats failed; rendering the heatmap as unavailable:', err)
      return { resp: null, failed: true as const, error: err instanceof Error ? err.message : null }
    }
  }),
)
