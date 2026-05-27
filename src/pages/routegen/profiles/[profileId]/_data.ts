import { Code, ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { activityRPCAtom, profilesRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'

// `null` resolves to "profile not found" — the shell renders an explicit empty state for it.
// Other RPC failures throw and bubble up to the router's error boundary.
export const profileFamilyAtom = atomFamily((profileId: string) =>
  atom(async get => {
    const rpc = get(profilesRPCAtom)
    const headers = get(projectHeaderAtom)
    if (!headers) return null
    try {
      const resp = await rpc.get({ id: profileId }, { headers })
      return resp.profile ?? null
    } catch (err) {
      if (err instanceof ConnectError && err.code === Code.NotFound) return null
      throw err
    }
  }),
)

// Decorative — heatmap is nice-to-have, so a stats failure must not take down the page.
export const profileStatsFamilyAtom = atomFamily((profileId: string) =>
  atom(async get => {
    const rpc = get(activityRPCAtom)
    const headers = get(projectHeaderAtom)
    if (!headers) return null
    try {
      return await rpc.getProfileStats({ distinctId: profileId }, { headers })
    } catch (err) {
      console.warn('GetProfileStats failed; falling back to no stats:', err)
      return null
    }
  }),
)
