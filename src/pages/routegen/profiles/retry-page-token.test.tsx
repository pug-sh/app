import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'
import { ProfileSchema } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { includeBotsAtom } from '@/data/bots.atoms'

const { list, getFilterSchema } = vi.hoisted(() => ({ list: vi.fn(), getFilterSchema: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { profilesRPCAtom: atom({ list }), insightsRPCAtom: atom({ getFilterSchema }) }
})

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return {
    ...actual,
    activeProjectAtom: atom({ id: 'p1', displayName: 'Test' }),
    projectHeaderAtom: atom({ 'x-project-id': 'p1' }),
  }
})

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

const Profiles = (await import('./index.page')).default

const page = (profiles: string[], nextPageToken: string) =>
  // eslint-disable-next-line require-yield
  (async function* () {
    yield { profiles: profiles.map(id => create(ProfileSchema, { id })), nextPageToken }
  })()

const tokenOf = (call: number) => list.mock.calls[call][0].pageToken

beforeEach(() => {
  list.mockReset()
  getFilterSchema.mockReset().mockResolvedValue(create(GetFilterSchemaResponseSchema, {}))
  window.history.replaceState(null, '', '/profiles')
  getDefaultStore().set(includeBotsAtom, false)
})

describe('profiles retry after a failed page-one request', () => {
  // Flipping the toggle re-runs page one while nextToken still holds the previous query's cursor.
  // Retrying off nextToken asks for page two of the old query and appends it to the stale rows.
  it('retries the request that failed, not whatever nextToken survived it', async () => {
    list.mockImplementationOnce(() => page(['a', 'b'], 'T1'))
    render(<Profiles />)
    await waitFor(() => expect(screen.getByText('Load more profiles')).toBeTruthy())
    expect(tokenOf(0)).toBe('')

    list.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    fireEvent.click(screen.getByText('Bots hidden'))
    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy())

    list.mockImplementationOnce(() => page(['c'], ''))
    fireEvent.click(screen.getByText('Retry'))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3))

    expect(tokenOf(2)).toBe('')
  })
})
