import { expect, mock, test } from 'bun:test'
import { Code, ConnectError } from '@connectrpc/connect'
import { atom, createStore } from 'jotai'

const headers = { 'x-project-id': 'project-1' }
const externalProfile = { id: 'internal-1', externalId: 'external-123' }
const internalProfile = { id: 'internal-1', externalId: '' }

let profilesRPC: {
  getByExternalId: (...args: unknown[]) => Promise<unknown>
  get: (...args: unknown[]) => Promise<unknown>
}

mock.module('@/api/rpc', () => ({
  activityRPCAtom: atom({ getProfileStats: async () => null }),
  profilesRPCAtom: atom({
    getByExternalId: (...args: unknown[]) => profilesRPC.getByExternalId(...args),
    get: (...args: unknown[]) => profilesRPC.get(...args),
  }),
}))

mock.module('@/data/workspace.atoms', () => ({
  projectHeaderAtom: atom(headers),
}))

const { profileFamilyAtom } = await import('../src/pages/routegen/profiles/[profileId]/_data')

test('profileFamilyAtom resolves profile route IDs as external IDs before internal IDs', async () => {
  const getByExternalIdCalls: unknown[][] = []
  const getCalls: unknown[][] = []
  profilesRPC = {
    getByExternalId: async (...args) => {
      getByExternalIdCalls.push(args)
      return { profile: externalProfile }
    },
    get: async (...args) => {
      getCalls.push(args)
      return { profile: internalProfile }
    },
  }

  await expect(createStore().get(profileFamilyAtom('external-123'))).resolves.toBe(externalProfile)

  expect(getByExternalIdCalls).toEqual([[{ externalId: 'external-123' }, { headers }]])
  expect(getCalls).toEqual([])
})

test('profileFamilyAtom falls back to internal Get only when external lookup is not found', async () => {
  const getByExternalIdCalls: unknown[][] = []
  const getCalls: unknown[][] = []
  profilesRPC = {
    getByExternalId: async (...args) => {
      getByExternalIdCalls.push(args)
      throw new ConnectError('missing external profile', Code.NotFound)
    },
    get: async (...args) => {
      getCalls.push(args)
      return { profile: internalProfile }
    },
  }

  await expect(createStore().get(profileFamilyAtom('internal-1'))).resolves.toBe(internalProfile)

  expect(getByExternalIdCalls).toEqual([[{ externalId: 'internal-1' }, { headers }]])
  expect(getCalls).toEqual([[{ id: 'internal-1' }, { headers }]])
})
