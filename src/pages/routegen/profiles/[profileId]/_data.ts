import { Code, ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import { atomWithRefresh } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { ProfileSessionSort } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom, profilesRPCAtom } from '@/api/rpc'
import { eventAvatarUrl } from '@/components/live-map/live-visitors'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { isCookielessId } from '@/lib/cookieless'
import { structGet } from '@/lib/struct'
import { tsToDate } from '@/lib/timestamp'

// A profile URL can carry either an external/distinct id (events + activity links resolve
// users by distinct id) or the internal profile id (the list links by it). Resolve by
// external id first, then fall back to the internal id.
//
// `null` resolves to "profile not found": the shell renders an explicit empty state for it.
// Other RPC failures throw and bubble up to the router's error boundary.
const isNotFound = (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound

// Always on here, unlike the list: without it an anonymous crawler reads as "not found", and an
// identified one comes back with no activity summary at all, including the bot flag the header shows.
export const profileFamilyAtom = atomFamily((profileId: string) =>
  atom(async get => {
    if (isCookielessId(profileId)) return null
    const rpc = get(profilesRPCAtom)
    // Above the first await: jotai only tracks a dependency read synchronously.
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

// Decorative: a failure must not take down the page, but stays distinct from an empty response.
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
      // Auth failures are session-wide, not a heatmap problem; let the boundary handle them.
      if (isAuthError(err)) throw err
      console.error('GetProfileStats failed; rendering the heatmap as unavailable:', err)
      return { resp: null, failed: true as const, error: err instanceof Error ? err.message : null }
    }
  }),
)

// One id is one UTC day (~48 sessions), so one page holds them all; include_bots keeps the bot sessions.
export const visitorFamilyAtom = atomFamily((visitorId: string) =>
  atomWithRefresh(async get => {
    const rpc = get(activityRPCAtom)
    const headers = get(projectHeaderAtom)
    if (!headers) return { visitor: null, failed: false }

    try {
      const [{ sessions }, { events }] = await Promise.all([
        rpc.getProfileSessions(
          { distinctId: visitorId, pageSize: 1000, sort: ProfileSessionSort.STARTED_AT, includeBots: true },
          { headers },
        ),
        rpc.getActivityFeed({ distinctId: visitorId, pageSize: 1, includeBots: true }, { headers }),
      ])
      if (sessions.length === 0 || events.length === 0) return { visitor: null, failed: false }

      const latest = events[0]
      const auto = latest.autoProperties
      const visitor = {
        totalEvents: sessions.reduce((sum, s) => sum + s.eventCount, 0n),
        sessions: sessions.length,
        firstSeen: tsToDate(sessions[sessions.length - 1].startedAt),
        lastSeen: tsToDate(latest.occurTime),
        bot: sessions.every(s => s.bot),
        browser: structGet(auto, '$browser'),
        browserVersion: structGet(auto, '$browserVersion'),
        os: structGet(auto, '$os'),
        osVersion: structGet(auto, '$osVersion'),
        city: structGet(auto, '$city'),
        region: structGet(auto, '$region'),
        country: structGet(auto, '$country'),
        avatarUrl: eventAvatarUrl(latest),
      }
      return { visitor, failed: false }
    } catch (err) {
      if (isAuthError(err)) throw err
      console.error('Visitor summary failed; rendering the header without it:', err)
      return { visitor: null, failed: true }
    }
  }),
)
