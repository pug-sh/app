import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetProfileSessionsResponseSchema, ProfileSessionSort } from '@/api/genproto/shared/activity/v1/activity_pb'

const { getProfileSessions } = vi.hoisted(() => ({ getProfileSessions: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { activityRPCAtom: atom({ getProfileSessions }) }
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

vi.mock('@/lib/route-params', () => ({ useRouteParams: () => ({ profileId: 'user-1' }) }))
vi.mock('@/lib/rpc-error', () => ({ toastRPCError: vi.fn(), rpcErrorMessage: (_: unknown, m: string) => m }))

const ProfileSessions = (await import('./index.page')).default

const start = new Date('2026-09-01T10:00:00Z')

const session = (id: string, eventCount: number) => ({
  sessionId: id,
  startedAt: timestampFromDate(start),
  endedAt: timestampFromDate(new Date(start.getTime() + 60_000)),
  eventCount: BigInt(eventCount),
})

const respond = (sessions: ReturnType<typeof session>[], nextPageToken = '') =>
  getProfileSessions.mockResolvedValueOnce(create(GetProfileSessionsResponseSchema, { sessions, nextPageToken }))

const argOf = (call: number) => getProfileSessions.mock.calls[call][0]

beforeEach(() => {
  getProfileSessions.mockReset()
})

describe('profile sessions', () => {
  // 263 is the load-bearing number: it exceeds the 200-event feed page this list used to group
  // client-side, so no count that large could have been rendered before.
  it("renders the server's rows and counts", async () => {
    respond([session('aaaaaaaa-1', 263), session('bbbbbbbb-2', 93), session('cccccccc-3', 4)])
    render(<ProfileSessions />)

    await waitFor(() => expect(screen.getByText('263')).toBeTruthy())
    expect(screen.getByText('93')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(argOf(0).pageToken).toBe('')
    expect(argOf(0).sort).toBe(ProfileSessionSort.STARTED_AT)
  })

  it('refetches from the first page when the sort changes', async () => {
    respond([session('aaaaaaaa-1', 2)], 'T1')
    render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByText('Load more sessions')).toBeTruthy())

    respond([session('bbbbbbbb-2', 9)])
    fireEvent.click(screen.getByText('Events'))
    await waitFor(() => expect(getProfileSessions).toHaveBeenCalledTimes(2))

    expect(argOf(1).sort).toBe(ProfileSessionSort.EVENT_COUNT)
    expect(argOf(1).pageToken).toBe('')
  })

  it('appends the next page', async () => {
    respond([session('aaaaaaaa-1', 2)], 'T1')
    render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByText('Load more sessions')).toBeTruthy())

    respond([session('bbbbbbbb-2', 9)])
    fireEvent.click(screen.getByText('Load more sessions'))
    await waitFor(() => expect(screen.getByText('9')).toBeTruthy())

    expect(argOf(1).pageToken).toBe('T1')
    expect(screen.getByText('2')).toBeTruthy()
  })

  // Re-clicking the active sort used to clear the cursor without refetching, stranding the rest
  // of the list behind a button that never came back.
  it('leaves pagination intact when the active sort header is clicked', async () => {
    respond([session('aaaaaaaa-1', 2)], 'T1')
    render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByText('Load more sessions')).toBeTruthy())

    fireEvent.click(screen.getByText('Started'))

    expect(screen.getByText('Load more sessions')).toBeTruthy()
    expect(getProfileSessions).toHaveBeenCalledTimes(1)
  })

  // The rows already on screen keep the error block off the page, so without an inline banner a
  // failed page is announced by nothing but a toast.
  it('shows a failed later page inline and retries that page, not the first', async () => {
    respond([session('aaaaaaaa-1', 2)], 'T1')
    render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByText('Load more sessions')).toBeTruthy())

    getProfileSessions.mockRejectedValueOnce(new Error('boom'))
    fireEvent.click(screen.getByText('Load more sessions'))
    await waitFor(() => expect(screen.getByText('Failed to load sessions')).toBeTruthy())

    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.queryByText('Load more sessions')).toBeNull()

    respond([session('bbbbbbbb-2', 9)])
    fireEvent.click(screen.getByText('Retry'))
    await waitFor(() => expect(screen.getByText('9')).toBeTruthy())
    expect(argOf(2).pageToken).toBe('T1')
  })

  // Two sort clicks in flight at once: the slower first answer must not land its rows — or its
  // cursor — under the header the second one now owns.
  it('discards a superseded sort response', async () => {
    respond([session('aaaaaaaa-1', 1)])
    render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy())

    let settleDuration = (_: unknown) => {}
    getProfileSessions.mockReturnValueOnce(new Promise(resolve => (settleDuration = resolve)))
    fireEvent.click(screen.getByText('Duration'))
    await waitFor(() => expect(getProfileSessions).toHaveBeenCalledTimes(2))

    respond([session('cccccccc-3', 33)])
    fireEvent.click(screen.getByText('Events'))
    await waitFor(() => expect(screen.getByText('33')).toBeTruthy())

    await act(async () => {
      settleDuration(create(GetProfileSessionsResponseSchema, { sessions: [session('bbbbbbbb-2', 22)] }))
    })

    expect(screen.queryByText('22')).toBeNull()
    expect(screen.getByText('33')).toBeTruthy()
  })
})
