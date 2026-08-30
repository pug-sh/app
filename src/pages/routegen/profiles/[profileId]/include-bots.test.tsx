import { create } from '@bufbuild/protobuf'
import { createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetByExternalIdResponseSchema, GetResponseSchema } from '@/api/genproto/shared/profiles/v1/profiles_pb'

// `bot` is only ever set on a read that asked for bots, so flipping either call back to the list's
// filtered read silently empties the header chip, the avatar glyph and the platform label's bot mark.
const { getByExternalId, get } = vi.hoisted(() => ({ getByExternalId: vi.fn(), get: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { profilesRPCAtom: atom({ getByExternalId, get }), activityRPCAtom: atom({}) }
})

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return { ...actual, projectHeaderAtom: atom({ 'x-project-id': 'p1' }) }
})

const { profileFamilyAtom } = await import('./_data')

beforeEach(() => {
  getByExternalId.mockReset()
  get.mockReset()
})

describe('profile detail reads bots in', () => {
  it('asks for bots on the external-id lookup', async () => {
    getByExternalId.mockResolvedValue(create(GetByExternalIdResponseSchema, { profile: { id: 'x' } }))
    await createStore().get(profileFamilyAtom('ext-1'))
    expect(getByExternalId.mock.calls[0][0].includeBots).toBe(true)
  })

  // atomFamily caches per id, so the fallback needs its own profileId to reach the second call.
  it('asks for bots on the internal-id fallback', async () => {
    getByExternalId.mockResolvedValue(create(GetByExternalIdResponseSchema, {}))
    get.mockResolvedValue(create(GetResponseSchema, { profile: { id: 'y' } }))
    await createStore().get(profileFamilyAtom('int-1'))
    expect(get.mock.calls[0][0].includeBots).toBe(true)
  })
})
