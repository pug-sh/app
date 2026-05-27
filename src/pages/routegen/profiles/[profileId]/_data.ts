import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { activityRPCAtom, profilesRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'

export const profileFamilyAtom = atomFamily((profileId: string) =>
  atom(async get => {
    const rpc = get(profilesRPCAtom)
    const headers = get(projectHeaderAtom)
    if (!headers) return null
    const resp = await rpc.get({ id: profileId }, { headers })
    return resp.profile ?? null
  }),
)

export const profileStatsFamilyAtom = atomFamily((profileId: string) =>
  atom(async get => {
    const rpc = get(activityRPCAtom)
    const headers = get(projectHeaderAtom)
    if (!headers) return null
    return rpc.getProfileStats({ distinctId: profileId }, { headers })
  }),
)
