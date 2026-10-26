import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Code, ConnectError } from '@connectrpc/connect'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, type PrimitiveAtom, Provider } from 'jotai'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import {
  GetActivityFeedResponseSchema,
  GetProfileSessionsResponseSchema,
} from '@/api/genproto/shared/activity/v1/activity_pb'
import { ProfileSchema } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { formatDateTime } from '@/lib/timestamp'

const { getProfileSessions, getActivityFeed, get, getByExternalId } = vi.hoisted(() => ({
  getProfileSessions: vi.fn(),
  getActivityFeed: vi.fn(),
  get: vi.fn(),
  getByExternalId: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    activityRPCAtom: atom({ getProfileSessions, getActivityFeed }),
    profilesRPCAtom: atom({ get, getByExternalId }),
  }
})

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return {
    ...actual,
    activeProjectAtom: atom({ id: 'p1', displayName: 'Test' }),
    projectHeaderAtom: atom<{ 'x-project-id': string } | undefined>({ 'x-project-id': 'p1' }),
    projectsLoadedAtom: atom(true),
  }
})

const ProfileShell = (await import('./_shell')).default
const { profileFamilyAtom } = await import('./_data')
const workspace = await import('@/data/workspace.atoms')
const headerAtom = workspace.projectHeaderAtom as PrimitiveAtom<{ 'x-project-id': string } | undefined>
const loadedAtom = workspace.projectsLoadedAtom as PrimitiveAtom<boolean>

const VISITOR = 'cookieless-Xk2v9QmT4rLw8bZp'
const start = new Date('2026-10-24T10:00:00Z')

const session = (id: string, eventCount: number, bot = false, startedAt = start) => ({
  sessionId: id,
  startedAt: timestampFromDate(startedAt),
  endedAt: timestampFromDate(new Date(startedAt.getTime() + 60_000)),
  eventCount: BigInt(eventCount),
  bot,
})

const respond = (sessions: ReturnType<typeof session>[], lastEvent = start) => {
  getProfileSessions.mockResolvedValue(create(GetProfileSessionsResponseSchema, { sessions }))
  const latest = {
    distinctId: VISITOR,
    kind: 'page_view',
    occurTime: timestampFromDate(lastEvent),
    autoProperties: { $browser: 'Chrome', $city: 'Bengaluru', $country: 'IN' },
  }
  const events = sessions.length ? [latest] : []
  getActivityFeed.mockResolvedValue(create(GetActivityFeedResponseSchema, { events }))
}

const headerLoaded = () => screen.findByText('First seen')

// Awaited, or React never retries the shell once the visitor atom resolves.
const renderShell = async (path: string, store = createStore()) => {
  const { hook, history } = memoryLocation({ path, record: true })
  await act(async () => {
    render(
      <Provider store={store}>
        <Router hook={hook}>
          <Route path="/p/:projectId/profiles/:profileId/*?">
            <Suspense fallback={null}>
              <ProfileShell>
                <p>tab body</p>
              </ProfileShell>
            </Suspense>
          </Route>
        </Router>
      </Provider>,
    )
  })
  return history
}

beforeEach(() => {
  for (const fn of [getProfileSessions, getActivityFeed, get, getByExternalId]) fn.mockReset()
})

describe('cookieless visitor shell', () => {
  it('shows the visitor header without asking for a profile', async () => {
    respond([session('aaaaaaaa-1', 3), session('bbbbbbbb-2', 4)])
    await renderShell(`/p/p1/profiles/${VISITOR}/events`)

    await headerLoaded()
    expect(screen.getByText(VISITOR)).toBeTruthy()
    expect(screen.getByText('7').nextSibling?.textContent).toBe('events')
    expect(screen.getByText('2').nextSibling?.textContent).toBe('sessions')
    expect(screen.getByText(/for one UTC day/)).toBeTruthy()
    expect(screen.getByText('tab body')).toBeTruthy()
    expect(get).not.toHaveBeenCalled()
    expect(getByExternalId).not.toHaveBeenCalled()
  })

  it('reads with bots included', async () => {
    respond([session('aaaaaaaa-1', 3)])
    await renderShell(`/p/p1/profiles/${VISITOR}/events`)

    await headerLoaded()
    expect(getProfileSessions.mock.calls[0][0]).toMatchObject({ distinctId: VISITOR, includeBots: true })
    expect(getActivityFeed.mock.calls[0][0]).toMatchObject({ distinctId: VISITOR, includeBots: true })
  })

  it('dates the visitor from its oldest session and its newest event', async () => {
    const firstSeen = new Date('2026-10-24T09:00:00Z')
    const lastSeen = new Date('2026-10-24T14:31:00Z')
    respond(
      [session('bbbbbbbb-2', 4, false, new Date('2026-10-24T14:00:00Z')), session('aaaaaaaa-1', 3, false, firstSeen)],
      lastSeen,
    )
    await renderShell(`/p/p1/profiles/${VISITOR}/events`)

    await headerLoaded()
    expect(screen.getByText(formatDateTime(firstSeen))).toBeTruthy()
    expect(screen.getByText(formatDateTime(lastSeen))).toBeTruthy()
  })

  it('never looks a visitor up as a profile', async () => {
    expect(await createStore().get(profileFamilyAtom(VISITOR))).toBeNull()
    expect(get).not.toHaveBeenCalled()
    expect(getByExternalId).not.toHaveBeenCalled()
  })

  it('offers only the Events and Sessions tabs', async () => {
    respond([session('aaaaaaaa-1', 3)])
    await renderShell(`/p/p1/profiles/${VISITOR}/sessions`)

    await headerLoaded()
    const tabs = screen.getAllByRole('link').map(a => [a.textContent, a.getAttribute('href')])
    expect(tabs).toEqual([
      ['Events', `/p/p1/profiles/${VISITOR}/events`],
      ['Sessions', `/p/p1/profiles/${VISITOR}/sessions`],
    ])
  })

  it.each(['', '/', '/properties', '/properties/'])('replaces "%s" with the events tab', async tail => {
    respond([session('aaaaaaaa-1', 3)])
    const history = await renderShell(`/p/p1/profiles/${VISITOR}${tail}`)

    await waitFor(() => expect(history).toEqual([`/p/p1/profiles/${VISITOR}/events`]))
  })

  it.each(['/events', '/sessions', '/sessions/aaaaaaaa-1'])('stays on %s', async tail => {
    respond([session('aaaaaaaa-1', 3)])
    const path = `/p/p1/profiles/${VISITOR}${tail}`
    const history = await renderShell(path)

    await screen.findByText('tab body')
    expect(history).toEqual([path])
  })

  it('says a visitor with no events has none, not that no profile exists', async () => {
    respond([])
    await renderShell(`/p/p1/profiles/${VISITOR}/events`)

    await screen.findByText('No events for this visitor')
    expect(screen.queryByText('No profile found')).toBeNull()
  })

  it('waits for the project list instead of saying there are no events', async () => {
    respond([session('aaaaaaaa-1', 3)])
    const store = createStore()
    store.set(loadedAtom, false)
    store.set(headerAtom, undefined)
    await renderShell(`/p/p1/profiles/${VISITOR}/events`, store)
    expect(screen.queryByText('No events for this visitor')).toBeNull()

    await act(async () => {
      store.set(headerAtom, { 'x-project-id': 'p1' })
      store.set(loadedAtom, true)
    })
    await headerLoaded()
  })

  it('keeps the tabs up and retries when the summary fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    respond([session('aaaaaaaa-1', 3)])
    getProfileSessions.mockRejectedValueOnce(new ConnectError('down', Code.Unavailable))
    await renderShell(`/p/p1/profiles/${VISITOR}/events`)

    await screen.findByText("Couldn't load this visitor's summary.")
    expect(screen.getByText('tab body')).toBeTruthy()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })))
    await headerLoaded()
    expect(screen.queryByText("Couldn't load this visitor's summary.")).toBeNull()
  })

  it.each([
    [[true, true], true],
    [[true, false], false],
    [[false, true], false],
  ])('marks sessions %j as automated: %s', async (bots, automated) => {
    respond(bots.map((bot, i) => session(`session-${i}`, 1, bot)))
    await renderShell(`/p/p1/profiles/${VISITOR}/events`)

    await headerLoaded()
    expect(screen.queryByText('Automated traffic') !== null).toBe(automated)
  })
})

describe('person shell', () => {
  it('keeps the overview and all four tabs', async () => {
    getByExternalId.mockResolvedValue({ profile: create(ProfileSchema, { id: 'd5kq0prof', externalId: 'user_42' }) })
    const path = '/p/p1/profiles/user_42'
    const history = await renderShell(path)

    await screen.findByText('tab body')
    expect(screen.getAllByRole('link').map(a => a.textContent)).toEqual([
      'Overview',
      'Events',
      'Sessions',
      'Properties',
    ])
    expect(history).toEqual([path])
    expect(getProfileSessions).not.toHaveBeenCalled()
  })
})
