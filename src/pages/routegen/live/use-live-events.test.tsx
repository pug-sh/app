import { create } from '@bufbuild/protobuf'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ActivityEvent,
  ActivityEventSchema,
  GetEventExplorerResponseSchema,
} from '@/api/genproto/shared/activity/v1/activity_pb'
import { LIVE_POLL_MS } from '@/components/live-map/live-visitors'

const { getEventExplorer } = vi.hoisted(() => ({ getEventExplorer: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { activityRPCAtom: atom({ getEventExplorer }) }
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

const { useLiveEvents } = await import('./use-live-events')

const respond = (events: ActivityEvent[] = []) => create(GetEventExplorerResponseSchema, { events })
const visitor = (distinctId: string) => create(ActivityEventSchema, { distinctId })

let hidden = false

// happy-dom's `document.hidden` is read-only, so the tab's state is a getter the test owns.
const setHidden = (next: boolean) => {
  hidden = next
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

// The first poll resolves after the render, so let it land inside act or its state updates warn.
const mount = async () => {
  const view = renderHook(() => useLiveEvents())
  await act(async () => {})
  return view
}

beforeEach(() => {
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  vi.useFakeTimers()
  getEventExplorer.mockReset().mockResolvedValue(respond())
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'hidden')
})

describe('live polling', () => {
  it('polls on mount and then every interval while the tab is visible', async () => {
    await mount()
    expect(getEventExplorer).toHaveBeenCalledTimes(1)

    await advance(LIVE_POLL_MS)

    expect(getEventExplorer).toHaveBeenCalledTimes(2)
  })

  // A backgrounded tab is throttled by the browser, never stopped, so the interval has to be the
  // thing that goes quiet. Run for a minute to catch a timer that was only slowed.
  it('sends nothing while the tab is hidden', async () => {
    await mount()
    setHidden(true)
    getEventExplorer.mockClear()

    await advance(60_000)

    expect(getEventExplorer).not.toHaveBeenCalled()
  })

  it('refreshes at once when the tab comes back, then resumes the interval', async () => {
    await mount()
    setHidden(true)
    await advance(60_000)
    getEventExplorer.mockClear()

    setHidden(false)
    await act(async () => {})
    expect(getEventExplorer).toHaveBeenCalledTimes(1)

    await advance(LIVE_POLL_MS)
    expect(getEventExplorer).toHaveBeenCalledTimes(2)
  })

  // Two timers alive would double every request, and nothing on screen would say so.
  it('keeps a single timer across repeated hide and show', async () => {
    await mount()
    for (let i = 0; i < 3; i++) {
      setHidden(true)
      setHidden(false)
    }
    await act(async () => {})
    getEventExplorer.mockClear()

    await advance(LIVE_POLL_MS)

    expect(getEventExplorer).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the page mounts in a hidden tab, and polls once it is shown', async () => {
    hidden = true
    await mount()
    await advance(60_000)
    expect(getEventExplorer).not.toHaveBeenCalled()

    setHidden(false)
    await act(async () => {})

    expect(getEventExplorer).toHaveBeenCalledTimes(1)
  })

  // The "+N" cue compares each poll with the one before it. After a long absence that is the
  // whole crowd that arrived meanwhile, which is not an arrival anyone watched happen.
  it('does not count visitors who arrived while hidden as new arrivals', async () => {
    getEventExplorer.mockResolvedValueOnce(respond([visitor('a')]))
    const { result } = await mount()

    setHidden(true)
    await advance(60_000)
    getEventExplorer.mockResolvedValue(respond([visitor('a'), visitor('b')]))
    setHidden(false)
    await act(async () => {})

    expect(result.current.arrivals).toBe(0)
  })

  it('stops the timer and the listener on unmount', async () => {
    const { unmount } = await mount()
    unmount()
    getEventExplorer.mockClear()

    await advance(60_000)
    setHidden(true)
    setHidden(false)
    await act(async () => {})

    expect(getEventExplorer).not.toHaveBeenCalled()
  })
})
