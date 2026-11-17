import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema, PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { GetEventExplorerResponseSchema } from '@/api/genproto/shared/activity/v1/activity_pb'
import { createFilter } from '@/components/event-filters/filter-model'
import { includeBotsAtom } from '@/data/bots.atoms'

const { getEventExplorer, getFilterSchema } = vi.hoisted(() => ({
  getEventExplorer: vi.fn(),
  getFilterSchema: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { activityRPCAtom: atom({ getEventExplorer }), insightsRPCAtom: atom({ getFilterSchema }) }
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

const EventExplorer = (await import('./index.page')).default

const request = (call: number) => getEventExplorer.mock.calls[call][0]
const refreshButton = () => screen.getByLabelText('Refresh events') as HTMLButtonElement
const settle = () => waitFor(() => expect(refreshButton().disabled).toBe(false))

beforeEach(() => {
  getEventExplorer.mockReset().mockResolvedValue(create(GetEventExplorerResponseSchema, {}))
  getFilterSchema.mockReset().mockResolvedValue(create(GetFilterSchemaResponseSchema, {}))
  window.history.replaceState(null, '', '/events')
  // The atom is module state seeded once at import, so a flip in one test is still set in the next.
  getDefaultStore().set(includeBotsAtom, false)
})

describe('events bot visibility', () => {
  // The write direction is exercised below, but the seed runs once per store, so it needs a fresh
  // one. Without this the initializer can be simplified to `false` and every other test stays green.
  it('seeds from the URL the page was opened on', () => {
    window.history.replaceState(null, '', '/events?bots=1')
    expect(createStore().get(includeBotsAtom)).toBe(true)
    window.history.replaceState(null, '', '/events')
    expect(createStore().get(includeBotsAtom)).toBe(false)
  })

  // Strict equality, not falsiness: a page that forgets the field sends `undefined`, which the
  // server's GetIncludeBots() reads as false: the right answer by accident, until someone changes
  // the default.
  it('asks for bots to be excluded on the first load', async () => {
    render(<EventExplorer />)
    await settle()
    expect(request(0).includeBots).toBe(false)
  })

  it('re-queries with bots included when the toggle is flipped', async () => {
    render(<EventExplorer />)
    await settle()

    fireEvent.click(screen.getByText('Bots hidden'))
    await waitFor(() => expect(getEventExplorer).toHaveBeenCalledTimes(2))

    expect(request(1).includeBots).toBe(true)
    expect(screen.getByText('Bots shown')).toBeTruthy()
  })

  it('writes the opt-in to the URL and drops it again', async () => {
    render(<EventExplorer />)
    await settle()
    expect(window.location.search).not.toContain('bots')

    fireEvent.click(screen.getByText('Bots hidden'))
    await waitFor(() => expect(window.location.search).toContain('bots=1'))

    fireEvent.click(screen.getByText('Bots shown'))
    await waitFor(() => expect(window.location.search).not.toContain('bots'))
  })
})

describe('events crawler requests', () => {
  const crawlerFilter = () =>
    window.history.replaceState(
      null,
      '',
      `/events?ef=${encodeURIComponent(JSON.stringify([{ kind: 'crawler_request', filters: [] }]))}`,
    )

  // Every crawler request is bot-tagged, so the filter alone would always come back empty.
  it('includes bots while crawler requests are filtered for, without changing the setting', async () => {
    crawlerFilter()
    render(<EventExplorer />)
    await settle()

    expect(request(0).includeBots).toBe(true)
    expect(screen.getByText('Bots shown').closest('button')?.getAttribute('aria-disabled')).toBe('true')
    expect(getDefaultStore().get(includeBotsAtom)).toBe(false)
    expect(window.location.search).not.toContain('bots')
  })

  it.each([
    [
      'a property filter',
      `pf=${encodeURIComponent(JSON.stringify([createFilter('$crawler_category', PropertySource.AUTO, FilterOperator.EQUALS, 'training')]))}`,
    ],
    [
      'an event row filter',
      `ef=${encodeURIComponent(JSON.stringify([{ kind: 'page_view', filters: [createFilter('$bot_reason', PropertySource.AUTO, FilterOperator.EQUALS, 'GPTBot')] }]))}`,
    ],
  ])('includes bots for a crawler property in %s', async (_, search) => {
    window.history.replaceState(null, '', `/events?${search}`)
    render(<EventExplorer />)
    await settle()

    expect(request(0).includeBots).toBe(true)
  })

  // A negation also matches every human row, so it leaves the setting to the user.
  it('keeps bots hidden for a negated crawler filter', async () => {
    const negation = createFilter('$crawler_category', PropertySource.AUTO, FilterOperator.IS_NOT_SET)
    window.history.replaceState(null, '', `/events?pf=${encodeURIComponent(JSON.stringify([negation]))}`)
    render(<EventExplorer />)
    await settle()

    expect(request(0).includeBots).toBe(false)
    expect(screen.getByText('Bots hidden')).toBeTruthy()
  })

  it('includes bots for a crawler id', async () => {
    render(<EventExplorer />)
    await settle()

    fireEvent.click(screen.getByText('Filter'))
    fireEvent.click(await screen.findByText('User ID'))
    fireEvent.change(screen.getByPlaceholderText('Type a value...'), { target: { value: 'crawler-gptbot' } })
    fireEvent.click(screen.getByText('Apply'))

    await waitFor(() => expect(getEventExplorer).toHaveBeenCalledTimes(2))
    expect(request(1)).toMatchObject({ distinctId: 'crawler-gptbot', includeBots: true })
  })

  // The request names no browser or OS, so the platform cell would read "–".
  it('names the crawler on its rows', async () => {
    getEventExplorer.mockResolvedValue(
      create(GetEventExplorerResponseSchema, {
        events: [
          {
            eventId: 'e1',
            kind: 'crawler_request',
            distinctId: 'crawler-gptbot',
            autoProperties: {
              $bot: true,
              $bot_reason: 'GPTBot',
              $crawler_company: 'OpenAI',
              $crawler_verified: 'verified',
              $url: 'https://example.com/pricing',
            },
          },
        ],
      }),
    )
    crawlerFilter()
    render(<EventExplorer />)

    expect(await screen.findByText('GPTBot')).toBeTruthy()
    expect(screen.getByText('OpenAI')).toBeTruthy()
    expect(screen.getByText('/pricing')).toBeTruthy()
    expect(screen.queryByLabelText('Failed IP check')).toBeNull()
  })

  // Outside the operator's published ranges: likely an impostor borrowing the name.
  it('marks a request that failed the IP check', async () => {
    getEventExplorer.mockResolvedValue(
      create(GetEventExplorerResponseSchema, {
        events: [
          {
            eventId: 'e1',
            kind: 'crawler_request',
            distinctId: 'crawler-gptbot',
            autoProperties: { $bot: true, $bot_reason: 'GPTBot', $crawler_verified: 'failed' },
          },
        ],
      }),
    )
    crawlerFilter()
    render(<EventExplorer />)

    expect(await screen.findByLabelText('Failed IP check')).toBeTruthy()
  })
})
