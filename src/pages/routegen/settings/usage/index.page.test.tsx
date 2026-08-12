import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

// happy-dom reports the chart container as 0x0, and the chart renders nothing at that size. No
// assertion here reads the chart — they read the caption, the banners and the period figure, all
// siblings of it — but giving it a size keeps this file exercising the real render path rather
// than a subtree that silently no-ops.
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

const { activeOrgAtom, commitProjectsAtom, projectsAtom } = await import('@/data/workspace.atoms')
const { themeAtom } = await import('@/data/theme.atoms')
const { setSeriesColorScheme } = await import('@/lib/event-colors')
const Usage = (await import('./index.page')).default

const org = create(OrgSchema, { id: 'org-a', displayName: 'Org A' })
const projects = [create(ProjectSchema, { id: 'p1', displayName: 'First' })]

const day = (iso: string, projectId: string, eventCount: number) =>
  ({ day: timestampFromDate(new Date(iso)), projectId, eventCount: BigInt(eventCount) }) as UsageDay

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

// projectsCommitted drives projectsLoadedAtom, which is what separates "this project was deleted"
// from "the list has not arrived yet" — the page words those differently and the second is the
// common path on a cold load.
const mount = ({ projectsCommitted = true } = {}) => {
  const store = createStore()
  store.set(activeOrgAtom, org)
  if (projectsCommitted) store.set(commitProjectsAtom, { orgId: org.id, projects })
  else store.set(projectsAtom, projects)
  return {
    ...render(
      <Provider store={store}>
        <Usage />
      </Provider>,
    ),
    store,
  }
}

// The chip is a popover: open it, then pick the option by its label.
const pickRange = (label: string) => {
  fireEvent.click(screen.getByText('range'))
  fireEvent.click(screen.getByText(label))
}

// Read off the trigger rather than by text: the popover's option list carries the same labels.
const rangeChip = () => screen.getByText('range').closest('button')?.textContent

const caption = () =>
  screen
    .getByText(/events over the last/)
    .textContent?.replace(/\s+/g, ' ')
    .trim()

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

// Recent enough to fall inside even the shortest preset (30 days), so a cell is always in the
// window whichever range a test picks. Dating it further back would drop it out, not keep it in.
const recent = () => daysAgo(2).toISOString()

// Lets a superseded promise's continuation run before the assertions. waitFor is not enough on its
// own: it invokes its callback synchronously on entry, so a condition that is already true resolves
// before the late response has been processed at all, and the assertion after it races the
// microtask queue — a coin flip against the very bug this file is named for.
const flush = async (p: Promise<unknown>) => {
  await act(async () => {
    await p.catch(() => {})
  })
}

beforeEach(() => {
  // restoreMocks does not clear call history, and the request-id assertions count calls.
  getUsage.mockReset()
})

// The series palette is module-level state, so a test that flips it has to put it back or every
// later file in the run inherits dark colours.
afterEach(() => {
  setSeriesColorScheme(false)
})

describe('Usage page — superseded requests', () => {
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
    await flush(stale.promise)

    expect(caption()).toMatch(/333 events over the last 365 days/)
    expect(screen.queryByText(/222 events/)).toBeNull()
  })

  it('ignores a superseded request that fails after a newer one has landed', async () => {
    const initial = deferred<unknown>()
    const stale = deferred<unknown>()
    const newest = deferred<unknown>()
    getUsage.mockReturnValueOnce(initial.promise).mockReturnValueOnce(stale.promise).mockReturnValueOnce(newest.promise)

    mount()
    initial.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText(/111 events over the last 30 days/)

    pickRange('90 days')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    pickRange('12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(3))

    newest.settle(usage([day(recent(), 'p1', 333)]))
    await screen.findByText(/333 events over the last 365 days/)

    // The 90-day request then hits its deadline. It describes a window nobody is looking at any
    // more, so its failure must not paint an error over data that is current and correct.
    stale.fail(new Error('too late'))
    await flush(stale.promise)

    expect(screen.queryByText(/showing the last data that loaded/)).toBeNull()
    expect(caption()).toMatch(/333 events over the last 365 days/)
  })

  it('stays busy when a superseded response lands while a newer request is still out', async () => {
    const initial = deferred<unknown>()
    const stale = deferred<unknown>()
    const newest = deferred<unknown>()
    getUsage.mockReturnValueOnce(initial.promise).mockReturnValueOnce(stale.promise).mockReturnValueOnce(newest.promise)

    mount()
    initial.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText(/111 events over the last 30 days/)

    pickRange('90 days')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    pickRange('12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(3))

    // The 90-day response lands while the 12-month request is still running. Clearing the busy flag
    // on it would re-enable Refresh and stop the spinner with a request still in flight.
    stale.settle(usage([day(recent(), 'p1', 222)]))
    await flush(stale.promise)

    const refresh = screen.getByLabelText('Refresh usage') as HTMLButtonElement
    expect(refresh.disabled).toBe(true)
  })
})

describe('Usage page — the window on screen', () => {
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

  // Widening can't catch this: a cell inside the 30-day window is inside every wider one too, so
  // the window has to *shrink* for a re-derived series to lose anything. This is the regression
  // `Loaded.range` exists for, and the caption-only assertion above passes straight through it.
  it('keeps the numbers on the window they were fetched for, not the one now picked', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const third = deferred<unknown>()
    getUsage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)

    mount()
    first.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText(/111 events over the last 30 days/)

    pickRange('12 months')
    // Dated so that only the 12-month window can contain it.
    second.settle(usage([day(daysAgo(60).toISOString(), 'p1', 222)]))
    await screen.findByText(/222 events over the last 365 days/)

    // Shrink again and leave the request in flight. Re-deriving the series from the picker would
    // re-window the response on screen to 30 days, drop the 60-day-old cell, and collapse a page
    // full of real numbers into "no metered events".
    pickRange('30 days')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(3))

    expect(caption()).toMatch(/222 events over the last 365 days/)
    expect(screen.queryByText(/No metered events in this window/)).toBeNull()
  })

  it('keeps the range chip naming the window that is actually on screen', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    getUsage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    mount()
    first.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText(/111 events over the last 30 days/)

    pickRange('12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    // Still out, so the chip must not yet claim a window the numbers beneath it didn't come from.
    expect(rangeChip()).toContain('30 days')

    second.fail(new Error('nope'))
    await screen.findByText(/showing the last data that loaded/)
    // And a change that never applied must never be left named on the control that applies it.
    expect(rangeChip()).toContain('30 days')
    expect(caption()).toMatch(/111 events over the last 30 days/)
  })

  it('sends the picked window, bounded by a deadline', async () => {
    const second = deferred<unknown>()
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'p1', 10)])).mockReturnValueOnce(second.promise)

    mount()
    await screen.findByText(/10 events over the last 30 days/)

    const [firstReq, firstOpts] = getUsage.mock.calls[0]
    // Connect applies no deadline of its own; without one a stalled socket strands the page on a
    // spinner with nothing to retry.
    expect(firstOpts).toMatchObject({ timeoutMs: expect.any(Number) })
    const span = (req: { range: { from: { seconds: bigint }; to: { seconds: bigint } } }) =>
      Number(req.range.to.seconds - req.range.from.seconds)
    expect(span(firstReq)).toBe(30 * 24 * 60 * 60)

    // The picker has to reach the request, not just the caption.
    pickRange('12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    expect(span(getUsage.mock.calls[1][0])).toBe(365 * 24 * 60 * 60)
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
})

describe('Usage page — refusing to assert a zero', () => {
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

  // Out-of-window rows read fine but describe days the page never asked about. Dropped silently,
  // a response entirely outside the window renders as "no metered events" — the same false zero.
  it('reports out-of-window rows instead of claiming there were no events', async () => {
    getUsage.mockResolvedValueOnce(usage([day('2020-01-01T00:00:00Z', 'p1', 900)]))

    mount()

    await screen.findByText(/Usage could not be read for this window/)
    expect(screen.queryByText(/No metered events in this window/)).toBeNull()
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

  // usage.proto is explicit about this third state: a stamp EARLIER than period_start means the
  // meter has not reached this period, so used_events is a placeholder zero carrying the previous
  // period's stamp — "render it as computing rather than as a total". It happens every 1st of the
  // month, and unboundedly if the meter stops.
  it('renders a period the meter has not reached as computing, not as zero', async () => {
    getUsage.mockResolvedValueOnce(
      usage([], {
        usedEvents: 0n,
        periodStart: timestampFromDate(new Date('2026-09-01T00:00:00Z')),
        periodEnd: timestampFromDate(new Date('2026-10-01T00:00:00Z')),
        usageComputedAt: timestampFromDate(new Date('2026-08-31T23:40:00Z')),
      }),
    )

    mount()

    await screen.findByText('Computing')
    await screen.findByText(/has not reached this period yet/)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('renders the total once the meter has reached the period', async () => {
    getUsage.mockResolvedValueOnce(
      usage([], {
        usedEvents: 4200n,
        periodStart: timestampFromDate(new Date('2026-08-01T00:00:00Z')),
        periodEnd: timestampFromDate(new Date('2026-09-01T00:00:00Z')),
        usageComputedAt: timestampFromDate(new Date('2026-08-12T02:15:00Z')),
      }),
    )

    mount()

    await screen.findByText('4,200')
    expect(screen.queryByText('Computing')).toBeNull()
  })

  it('refuses to render a negative period total', async () => {
    getUsage.mockResolvedValueOnce(
      usage([], { usedEvents: -5n, usageComputedAt: timestampFromDate(new Date('2026-08-12T02:15:00Z')) }),
    )

    mount()

    await screen.findByText(/negative total/)
    expect(screen.queryByText('-5')).toBeNull()
  })

  // Days past the meter's last pass have no rows, so the chart fills them with zero — visually
  // identical to days that genuinely had no events. On a billing page that reads as a usage
  // collapse rather than an outage.
  it('says the tail of the chart is unmetered rather than letting zero bars imply no usage', async () => {
    getUsage.mockResolvedValueOnce(
      usage([day(daysAgo(8).toISOString(), 'p1', 10)], {
        usedEvents: 10n,
        usageComputedAt: timestampFromDate(daysAgo(7)),
      }),
    )

    mount()

    await screen.findByText(/unmetered — not zero/)
  })

  // protobuf-es returns a truthy Invalid Date for an out-of-range int64 rather than throwing, and
  // Intl.DateTimeFormat throws RangeError on it — during render, which takes down the whole
  // Settings shell (RouteErrorBoundary wraps Layout) with a retry that hits the same response.
  it('survives period stamps too large to be dates, rather than throwing mid-render', async () => {
    const huge = { seconds: 1754006400000000n, nanos: 0 }
    getUsage.mockResolvedValueOnce(
      usage([], { usedEvents: 10n, usageComputedAt: huge, periodStart: huge, periodEnd: huge }),
    )

    mount()

    await screen.findByText(/never been metered/)
  })
})

describe('Usage page — theme', () => {
  // CLAUDE.md calls this trap out by name: getIndexedColor reads a module-level scheme that the
  // theme toggle mutates, and a module mutation cannot invalidate a useMemo. Both halves below are
  // required and that is exactly the point — flipping the scheme alone leaves the memo holding
  // stale colours, flipping the atom alone recomputes the identical values, and only listing
  // resolvedTheme in the deps makes the two agree.
  it('re-colours the breakdown when the theme flips', async () => {
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'p1', 10)]))

    const { container, store } = mount()
    await screen.findByText(/10 events over the last 30 days/)

    const dot = () => (container.querySelector('tbody tr td span span[style]') as HTMLElement).style.backgroundColor
    const light = dot()
    expect(light).not.toBe('')

    act(() => {
      setSeriesColorScheme(true)
      store.set(themeAtom, 'dark')
    })

    expect(dot()).not.toBe(light)
  })
})

describe('Usage page — naming projects', () => {
  it('does not accuse the org of deleting a project before the list has loaded', async () => {
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'ghost', 10)]))

    mount({ projectsCommitted: false })

    await screen.findByText('Project ghost…')
    expect(screen.queryByText(/Unknown project/)).toBeNull()
  })

  it('calls a project unknown only once the list has actually landed without it', async () => {
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'ghost', 10)]))

    mount()

    await screen.findByText('Unknown project (ghost…)')
  })
})
