import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { GetUsageResponseSchema, type UsageDay } from '@/api/genproto/dashboard/usage/v1/usage_pb'

// The page's async behaviour is the point of this file, so the call is hand-held: a deferred
// promise per request lets a test settle them out of order, which is the only way to land a
// superseded response into a page that has moved on.
const { getUsage } = vi.hoisted(() => ({ getUsage: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { usageRPCAtom: atom({ getUsage }) }
})

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  isAnalyticsEnabled: () => false,
}))

// happy-dom reports the chart container as 0x0, and at that size the chart renders nothing —
// every assertion below would pass vacuously.
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

const { activeOrgAtom, projectsAtom } = await import('@/data/workspace.atoms')
const Usage = (await import('./index.page')).default

const org = create(OrgSchema, { id: 'org-a', displayName: 'Org A' })
const projects = [create(ProjectSchema, { id: 'p1', displayName: 'First' })]

const day = (iso: string, projectId: string, eventCount: number) =>
  ({ day: timestampFromDate(new Date(iso)), projectId, eventCount: BigInt(eventCount) }) as UsageDay

// Dated far enough back that every range preset covers them, so a test never depends on today.
const usage = (daily: UsageDay[], extra: Parameters<typeof create<typeof GetUsageResponseSchema>>[1] = {}) =>
  create(GetUsageResponseSchema, { daily, ...extra })

const deferred = <T,>() => {
  let settle!: (v: T) => void
  let fail!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    settle = res
    fail = rej
  })
  return { promise, settle, fail }
}

const mount = () => {
  const store = createStore()
  store.set(activeOrgAtom, org)
  store.set(projectsAtom, projects)
  return render(
    <Provider store={store}>
      <Usage />
    </Provider>,
  )
}

// The chip is a popover: open it, then pick the option by its label.
const pickRange = (label: string) => {
  fireEvent.click(screen.getByText('range'))
  fireEvent.click(screen.getByText(label))
}

const caption = () =>
  screen
    .getByText(/events over the last/)
    .textContent?.replace(/\s+/g, ' ')
    .trim()

// Yesterday relative to nothing in particular — buildUsageSeries only needs the cells inside the
// requested window, and every preset here starts at least 30 days back.
const recent = () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  // restoreMocks does not clear call history, and the request-id assertions count calls.
  getUsage.mockReset()
})

describe('Usage page', () => {
  it('ignores a superseded response that lands after a newer one', async () => {
    const initial = deferred<unknown>()
    const stale = deferred<unknown>()
    const newest = deferred<unknown>()
    getUsage.mockReturnValueOnce(initial.promise).mockReturnValueOnce(stale.promise).mockReturnValueOnce(newest.promise)

    mount()
    // The range chip only exists once something has loaded, so seed the page first.
    initial.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText(/111 events over the last 30 days/)

    // Two more requests in flight at once: the chip is never disabled during a fetch, so this is
    // reachable with two quick clicks.
    pickRange('90 days')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    pickRange('12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(3))

    // The newest settles first, then the superseded one arrives late and must be discarded.
    newest.settle(usage([day(recent(), 'p1', 333)]))
    await screen.findByText(/333 events over the last 365 days/)

    stale.settle(usage([day(recent(), 'p1', 222)]))
    await waitFor(() => expect(caption()).toMatch(/333 events over the last 365 days/))
    expect(screen.queryByText(/222 events/)).toBeNull()
  })

  it('describes the window the data came from, not the one now picked', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    getUsage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    mount()
    first.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText(/111 events over the last 30 days/)

    // Second request in flight and deliberately never settled: for that whole round trip the
    // caption must keep describing the 30-day window the numbers actually came from.
    pickRange('12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    expect(caption()).toMatch(/111 events over the last 30 days/)
  })

  it('keeps the loaded data on screen when a refresh fails', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    getUsage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    mount()
    first.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText(/111 events over the last 30 days/)

    fireEvent.click(screen.getByLabelText('Refresh usage'))
    second.fail(new Error('nope'))

    await screen.findByText(/showing the last data that loaded/)
    // The reader keeps the numbers rather than being dropped onto a bare error page whose only
    // control retries the query that just failed.
    expect(caption()).toMatch(/111 events over the last 30 days/)
  })

  it('reports unreadable rows instead of claiming there were no events', async () => {
    getUsage.mockResolvedValueOnce(usage([{ day: undefined, projectId: 'p1', eventCount: 900n } as UsageDay]))

    mount()

    await screen.findByText(/Usage could not be read for this window/)
    expect(screen.queryByText(/No metered events in this window/)).toBeNull()
  })

  it('still shows the totals when only some rows are unreadable', async () => {
    getUsage.mockResolvedValueOnce(
      usage([{ day: undefined, projectId: 'p1', eventCount: 900n } as UsageDay, day(recent(), 'p1', 10)]),
    )

    mount()

    await screen.findByText(/1 usage row could not be read/)
    expect(caption()).toMatch(/10 events over the last 30 days/)
  })

  // The obvious version of this test passes against an implementation keyed on usedEvents, because
  // usedEvents is 0n in both cases. Only the pair discriminates, so both halves stay together.
  it('separates a never-metered org from one metered at zero', async () => {
    getUsage.mockResolvedValueOnce(usage([]))
    const { unmount } = mount()
    await screen.findByText('Unknown')
    unmount()

    getUsage.mockResolvedValueOnce(
      usage([], { usedEvents: 0n, usageComputedAt: timestampFromDate(new Date('2026-08-12T02:15:00Z')) }),
    )
    mount()
    await screen.findByText(/Last metered Aug 12, 02:15 UTC/)
    expect(screen.queryByText('Unknown')).toBeNull()
  })
})
