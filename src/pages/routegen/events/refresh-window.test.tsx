import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'
import {
  type ActivityEvent,
  ActivityEventSchema,
  GetEventExplorerResponseSchema,
} from '@/api/genproto/shared/activity/v1/activity_pb'
import { tsToDate } from '@/lib/timestamp'

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

const AT_LOAD = new Date(2026, 7, 19, 10, 0, 0)
const FOUR_HOURS_LATER = new Date(2026, 7, 19, 14, 0, 0)

const respond = (events: ActivityEvent[] = [], nextPageToken = '') =>
  create(GetEventExplorerResponseSchema, { events, nextPageToken })

const request = (call: number) => getEventExplorer.mock.calls[call][0]

const windowOf = (call: number) => {
  const range = request(call).timeRange
  return { from: tsToDate(range.from), to: tsToDate(range.to) }
}

const refreshButton = () => screen.getByLabelText('Refresh events') as HTMLButtonElement

const settle = () => waitFor(() => expect(refreshButton().disabled).toBe(false))

beforeEach(() => {
  // Only Date — waitFor still needs real timers to poll on.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AT_LOAD)
  getEventExplorer.mockReset().mockResolvedValue(respond())
  getFilterSchema.mockReset().mockResolvedValue(create(GetFilterSchemaResponseSchema, {}))
})

afterEach(() => vi.useRealTimers())

describe('events refresh', () => {
  // The page landed on 'This month', whose `to` is the instant the range resolved. Sent as stored,
  // every refresh re-queries the window that ended at page load, so nothing that arrived since can
  // come back — while the "Updated just now" stamp says otherwise.
  it('queries up to now, not up to when the page loaded', async () => {
    render(<EventExplorer />)
    await settle()
    expect(windowOf(0).to).toEqual(AT_LOAD)

    vi.setSystemTime(FOUR_HOURS_LATER)
    fireEvent.click(refreshButton())
    await waitFor(() => expect(getEventExplorer).toHaveBeenCalledTimes(2))

    expect(windowOf(1).to).toEqual(FOUR_HOURS_LATER)
    expect(windowOf(1).from).toEqual(new Date(2026, 7, 1))
  })

  // The page-two cursor was issued against the window page one used, so re-resolving here would page
  // a different window than the cursor came from.
  it('holds the window still across "Load more"', async () => {
    getEventExplorer.mockResolvedValueOnce(respond([create(ActivityEventSchema, { eventId: 'e1' })], 'tok2'))
    render(<EventExplorer />)
    await settle()

    vi.setSystemTime(FOUR_HOURS_LATER)
    fireEvent.click(screen.getByText('Load more events'))
    await waitFor(() => expect(getEventExplorer).toHaveBeenCalledTimes(2))

    expect(windowOf(1)).toEqual(windowOf(0))
  })

  // Deleting `queryRangeRef.current = range` leaves every other test green: they never refresh
  // before paging, so the ref's mount value already matches what the assignment would store.
  it('pages against the refreshed window, not the one it mounted with', async () => {
    getEventExplorer.mockResolvedValue(respond([create(ActivityEventSchema, { eventId: 'e1' })], 'tok2'))
    render(<EventExplorer />)
    await settle()

    vi.setSystemTime(FOUR_HOURS_LATER)
    fireEvent.click(refreshButton())
    await waitFor(() => expect(getEventExplorer).toHaveBeenCalledTimes(2))
    await settle()

    fireEvent.click(screen.getByText('Load more events'))
    await waitFor(() => expect(getEventExplorer).toHaveBeenCalledTimes(3))
    expect(windowOf(2)).toEqual(windowOf(1))
    expect(windowOf(2).to).toEqual(FOUR_HOURS_LATER)
  })

  it('retries the refresh that failed rather than the next page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getEventExplorer.mockResolvedValueOnce(respond([create(ActivityEventSchema, { eventId: 'e1' })], 'tok2'))
    render(<EventExplorer />)
    await settle()

    getEventExplorer.mockRejectedValueOnce(new ConnectError('refresh blew up', Code.Internal))
    fireEvent.click(refreshButton())
    // Not '[internal] refresh blew up' — the raw ConnectError message is not user-facing.
    await waitFor(() => expect(screen.getByText('refresh blew up')).toBeTruthy())

    fireEvent.click(screen.getByText('Retry'))
    await waitFor(() => expect(getEventExplorer).toHaveBeenCalledTimes(3))
    expect(request(2).pageToken).toBe('')
  })

  // The mirror of the test above: retrying a failed page two must not reset to page one and throw
  // away every page already loaded.
  it('retries the page that failed rather than resetting to page one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getEventExplorer.mockResolvedValueOnce(respond([create(ActivityEventSchema, { eventId: 'e1' })], 'tok2'))
    render(<EventExplorer />)
    await settle()

    getEventExplorer.mockRejectedValueOnce(new ConnectError('page two blew up', Code.Unavailable))
    fireEvent.click(screen.getByText('Load more events'))
    await waitFor(() => expect(screen.getByText('page two blew up')).toBeTruthy())

    fireEvent.click(screen.getByText('Retry'))
    await waitFor(() => expect(getEventExplorer).toHaveBeenCalledTimes(3))
    expect(request(2).pageToken).toBe('tok2')
  })
})
