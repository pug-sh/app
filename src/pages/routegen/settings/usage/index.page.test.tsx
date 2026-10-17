import { clone, create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GetBillingStatusResponseSchema, SubscriptionStatus } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { GetUsageResponseSchema, type UsageDay } from '@/api/genproto/dashboard/usage/v1/usage_pb'
import type { useBilling } from '@/hooks/use-billing'
import { DAILY_ROW_CAP, formatPeriod, lastNUtcDays } from './usage-helpers'

// Hand-held, so a test can settle requests out of order.
const { getUsage } = vi.hoisted(() => ({ getUsage: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { usageRPCAtom: atom({ getUsage }) }
})

// The real hook calls getUsage too, eating the hand-held responses above. Defaults to settled, no period.
const { billing } = vi.hoisted(() => ({
  billing: { current: { loaded: true, status: null } as Pick<ReturnType<typeof useBilling>, 'loaded' | 'status'> },
}))

vi.mock('@/hooks/use-billing', () => ({ useBilling: () => billing.current }))

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

// happy-dom reports the chart container as 0x0, and the chart renders nothing at that size.
vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

const { activeOrgAtom, commitProjectsAtom, projectsAtom } = await import('@/data/workspace.atoms')
const { compiledThemeAtom, installedThemesAtom, themeModeAtom, themeSelectionAtom } = await import('@/data/theme.atoms')
const { setSeriesPalette } = await import('@/lib/event-colors')
const { compileDataPalette } = await import('@/theme/data-palette')
const { PUG_CANVAS } = await import('@/theme/fit')
const pugPalette = (polarity: 'light' | 'dark') =>
  compileDataPalette(undefined, polarity, 'standard', PUG_CANVAS[polarity])
const Usage = (await import('./index.page')).default

const org = create(OrgSchema, { id: 'org-a', displayName: 'Org A' })
const projects = [create(ProjectSchema, { id: 'p1', displayName: 'First' })]

const day = (iso: string, projectId: string, eventCount: number) =>
  ({ day: timestampFromDate(new Date(iso)), projectId, eventCount: BigInt(eventCount) }) as UsageDay

// Metered just now unless a test says otherwise, so the headline has a total to show.
const usage = (daily: UsageDay[], extra: Parameters<typeof create<typeof GetUsageResponseSchema>>[1] = {}) =>
  create(GetUsageResponseSchema, { daily, usageComputedAt: timestampFromDate(new Date()), ...extra })

const deferred = <T,>() => {
  let settle!: (v: T) => void
  let fail!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    settle = res
    fail = rej
  })
  return { promise, settle, fail }
}

// projectsCommitted drives projectsLoadedAtom, which separates a deleted project from one not loaded yet.
const mount = ({ projectsCommitted = true } = {}) => {
  const store = createStore()
  store.set(activeOrgAtom, org)
  if (projectsCommitted) store.set(commitProjectsAtom, { orgId: org.id, projects })
  else store.set(projectsAtom, projects)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  return { ...render(<Usage />, { wrapper }), store }
}

// The chip is a popover: open it, then pick the option by its label.
const pickRange = (label: string) => {
  fireEvent.click(screen.getByText('range'))
  fireEvent.click(screen.getByText(label))
}

// Read off the trigger rather than by text: the popover's option list carries the same labels.
const rangeChip = () => screen.getByText('range').closest('button')?.textContent

// The window's total; the project table repeats the same figures, so it is found by its size.
const HEADLINE = { selector: 'span.text-4xl' }
const headline = () => screen.getByText(/./, HEADLINE).textContent

const lastDays = (days: 30 | 90 | 180 | 365) => {
  const { from, to } = lastNUtcDays(days)
  return formatPeriod(from, to)
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

// Inside every window a test asks for, the shortest being a billing period begun five days ago.
const recent = () => daysAgo(2).toISOString()

// Lets a superseded promise's continuation run first: waitFor can resolve before it has.
const flush = async (p: Promise<unknown>) => {
  await act(async () => {
    await p.catch(() => {})
  })
}

beforeEach(() => {
  // restoreMocks does not clear call history, and the request-id assertions count calls.
  getUsage.mockReset()
  billing.current = { loaded: true, status: null }
})

// The series palette is module state, so a test that flips it has to put it back.
afterEach(() => {
  setSeriesPalette(pugPalette('light'))
  vi.useRealTimers()
})

describe('Usage page: superseded requests', () => {
  it('ignores a superseded response that lands after a newer one', async () => {
    const initial = deferred<unknown>()
    const stale = deferred<unknown>()
    const newest = deferred<unknown>()
    getUsage.mockReturnValueOnce(initial.promise).mockReturnValueOnce(stale.promise).mockReturnValueOnce(newest.promise)

    mount()
    initial.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText('111', HEADLINE)

    // The chip is never disabled during a fetch, so two quick picks overlap.
    pickRange('Last 90 days')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    pickRange('Last 12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(3))

    newest.settle(usage([day(recent(), 'p1', 333)]))
    await screen.findByText('333', HEADLINE)

    stale.settle(usage([day(recent(), 'p1', 222)]))
    await flush(stale.promise)

    expect(headline()).toBe('333')
    expect(rangeChip()).toContain('Last 12 months')
    expect(screen.queryByText('222')).toBeNull()
  })

  it('ignores a superseded request that fails after a newer one has landed', async () => {
    const initial = deferred<unknown>()
    const stale = deferred<unknown>()
    const newest = deferred<unknown>()
    getUsage.mockReturnValueOnce(initial.promise).mockReturnValueOnce(stale.promise).mockReturnValueOnce(newest.promise)

    mount()
    initial.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText('111', HEADLINE)

    pickRange('Last 90 days')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    pickRange('Last 12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(3))

    newest.settle(usage([day(recent(), 'p1', 333)]))
    await screen.findByText('333', HEADLINE)

    stale.fail(new Error('too late'))
    await flush(stale.promise)

    expect(screen.queryByText(/Showing the last data that loaded/)).toBeNull()
    expect(headline()).toBe('333')
  })

  it('stays busy when a superseded response lands while a newer request is still out', async () => {
    const initial = deferred<unknown>()
    const stale = deferred<unknown>()
    const newest = deferred<unknown>()
    getUsage.mockReturnValueOnce(initial.promise).mockReturnValueOnce(stale.promise).mockReturnValueOnce(newest.promise)

    mount()
    initial.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText('111', HEADLINE)

    pickRange('Last 90 days')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    pickRange('Last 12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(3))

    stale.settle(usage([day(recent(), 'p1', 222)]))
    await flush(stale.promise)

    const refresh = screen.getByLabelText('Refresh usage') as HTMLButtonElement
    expect(refresh.disabled).toBe(true)
  })
})

describe('Usage page: the window on screen', () => {
  it('describes the window the data came from, not the one now picked', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    getUsage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    mount()
    first.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText('111', HEADLINE)

    pickRange('Last 12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    expect(headline()).toBe('111')
    expect(screen.getByText(lastDays(30))).toBeTruthy()
    expect(rangeChip()).toContain('Last 30 days')
  })

  // Only a shrinking window can catch a series re-derived from the picker: the old cell falls out of it.
  it('keeps the numbers on the window they were fetched for, not the one now picked', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const third = deferred<unknown>()
    getUsage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)

    mount()
    first.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText('111', HEADLINE)

    pickRange('Last 12 months')
    second.settle(usage([day(daysAgo(60).toISOString(), 'p1', 222)]))
    await screen.findByText('222', HEADLINE)

    pickRange('Last 30 days')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(3))

    expect(headline()).toBe('222')
  })

  it('keeps the range chip naming the window that is actually on screen', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    getUsage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    mount()
    first.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText('111', HEADLINE)

    pickRange('Last 12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    expect(rangeChip()).toContain('Last 30 days')

    second.fail(new Error('nope'))
    await screen.findByText(/Showing the last data that loaded/)
    expect(rangeChip()).toContain('Last 30 days')
    expect(headline()).toBe('111')
  })

  it('retries a range whose fetch failed when it is picked again', async () => {
    getUsage
      .mockResolvedValueOnce(usage([day(recent(), 'p1', 111)]))
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce(usage([day(recent(), 'p1', 333)]))

    mount()
    await screen.findByText('111', HEADLINE)

    pickRange('Last 12 months')
    await screen.findByText(/Showing the last data that loaded/)
    pickRange('Last 12 months')

    await screen.findByText('333', HEADLINE)
  })

  it('sends the picked window, bounded by a deadline', async () => {
    const second = deferred<unknown>()
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'p1', 10)])).mockReturnValueOnce(second.promise)

    mount()
    await screen.findByText('10', HEADLINE)

    const [firstReq, firstOpts] = getUsage.mock.calls[0]
    expect(firstOpts).toMatchObject({ timeoutMs: expect.any(Number) })
    const span = (req: { range: { from: { seconds: bigint }; to: { seconds: bigint } } }) =>
      Number(req.range.to.seconds - req.range.from.seconds)
    expect(span(firstReq)).toBe(30 * 24 * 60 * 60)

    pickRange('Last 12 months')
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    expect(span(getUsage.mock.calls[1][0])).toBe(365 * 24 * 60 * 60)
  })

  it('keeps the loaded data on screen when a refresh fails', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    getUsage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    mount()
    first.settle(usage([day(recent(), 'p1', 111)]))
    await screen.findByText('111', HEADLINE)

    fireEvent.click(screen.getByLabelText('Refresh usage'))
    second.fail(new Error('nope'))

    await screen.findByText(/Showing the last data that loaded/)
    expect(headline()).toBe('111')
  })

  // The server's period count covers the usage period, not the window picked here.
  it("totals the window on screen, not the server's period count", async () => {
    getUsage.mockResolvedValueOnce(
      usage([day(recent(), 'p1', 10), day(recent(), 'p2', 5)], { counted: true, usedEvents: 999n }),
    )

    mount()

    await screen.findByText('15', HEADLINE)
    expect(screen.queryByText('999')).toBeNull()
    expect(screen.queryByText(/row limit/)).toBeNull()
  })
})

describe('Usage page: the current period', () => {
  type Req = { range: { from: { seconds: bigint }; to: { seconds: bigint } } }

  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000

  // 12 days back against subscribe()'s 5, so a request shows which period the page chose.
  const usagePeriod = (startDaysAgo = 12) => {
    const start = daysAgo(startDaysAgo)
    start.setUTCHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)
    return {
      periodStart: timestampFromDate(start),
      periodEnd: timestampFromDate(end),
      from: BigInt(utcDay(start)),
      to: BigInt(utcDay(end)),
    }
  }

  const unsubscribed = (startDaysAgo?: number) => {
    const period = usagePeriod(startDaysAgo)
    billing.current = {
      loaded: true,
      status: create(GetBillingStatusResponseSchema, { periodStart: period.periodStart, periodEnd: period.periodEnd }),
    }
    return period
  }

  const subscribe = (startDaysAgo = 5) => {
    const start = daysAgo(startDaysAgo)
    start.setUTCHours(9, 30, 0, 0)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)
    const { periodStart, periodEnd } = usagePeriod()
    billing.current = {
      loaded: true,
      status: create(GetBillingStatusResponseSchema, {
        periodStart,
        periodEnd,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        currentPeriodStart: timestampFromDate(start),
        currentPeriodEnd: timestampFromDate(end),
      }),
    }
    return { from: BigInt(utcDay(start)), to: BigInt(utcDay(end)), days: (utcDay(end) - utcDay(start)) / 86_400 }
  }

  it('defaults a subscriber to the whole billing period, days not yet reached included', async () => {
    const period = subscribe()
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'p1', 10)]))

    const { container } = mount()
    await screen.findByText('10', HEADLINE)

    const req: Req = getUsage.mock.calls[0][0]
    expect([req.range.from.seconds, req.range.to.seconds]).toEqual([period.from, period.to])
    expect(rangeChip()).toContain('Current billing period')
    expect(container.querySelectorAll('g.series-bar rect')).toHaveLength(period.days)
    expect(screen.queryByText(/unmetered/)).toBeNull()
  })

  it('defaults an org with no subscription to its usage period', async () => {
    const period = unsubscribed()
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'p1', 10)]))

    mount()
    await screen.findByText('10', HEADLINE)

    const req: Req = getUsage.mock.calls[0][0]
    expect([req.range.from.seconds, req.range.to.seconds]).toEqual([period.from, period.to])
    expect(rangeChip()).toContain('Current period')
    expect(rangeChip()).not.toContain('billing')
  })

  it('never gives a live subscription the usage period, even with no billing dates', async () => {
    const { periodStart, periodEnd } = usagePeriod()
    billing.current = {
      loaded: true,
      status: create(GetBillingStatusResponseSchema, {
        periodStart,
        periodEnd,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      }),
    }
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'p1', 10)]))

    mount()
    await screen.findByText('10', HEADLINE)

    expect(rangeChip()).toContain('Last 30 days')
  })

  it('waits for billing before the first request, so a cold load asks once', async () => {
    billing.current = { loaded: false, status: null }
    getUsage.mockResolvedValue(usage([day(recent(), 'p1', 10)]))

    const { rerender } = mount()
    await act(async () => {})
    expect(getUsage).not.toHaveBeenCalled()

    const period = subscribe()
    rerender(<Usage />)
    await screen.findByText('10', HEADLINE)
    expect(getUsage).toHaveBeenCalledTimes(1)
    expect((getUsage.mock.calls[0][0] as Req).range.from.seconds).toBe(period.from)
  })

  it('stops waiting on a stalled billing call', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    billing.current = { loaded: false, status: null }
    getUsage.mockResolvedValue(usage([day(recent(), 'p1', 10)]))

    mount()
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    await screen.findByText('10', HEADLINE)
    expect(rangeChip()).toContain('Last 30 days')
  })

  it('reports a missing org rather than waiting on billing', async () => {
    billing.current = { loaded: false, status: null }

    render(
      <Provider store={createStore()}>
        <Usage />
      </Provider>,
    )

    await screen.findByText('No organization selected')
  })

  it('falls back to the rolling default once the billing period has ended, never to the usage period', async () => {
    subscribe(40)
    getUsage.mockResolvedValue(usage([day(recent(), 'p1', 10)]))

    mount()

    await screen.findByText('10', HEADLINE)
    expect(rangeChip()).toContain('Last 30 days')
    fireEvent.click(screen.getByText('range'))
    expect(screen.queryByText('Current billing period')).toBeNull()
    expect(screen.queryByText('Current period')).toBeNull()
  })

  it('says a period the meter has not reached is not counted yet, and lists nothing under it', async () => {
    subscribe()
    getUsage.mockResolvedValue(usage([day(recent(), 'p1', 10)], { usageComputedAt: timestampFromDate(daysAgo(8)) }))

    const { container } = mount()

    await screen.findByText('Not counted yet', HEADLINE)
    expect(screen.getByText(/has not reached this window yet/)).toBeTruthy()
    expect(screen.queryByText(/stored as no row at all/)).toBeNull()
    expect(screen.queryByText(/unmetered/)).toBeNull()
    expect(screen.queryByText('By project')).toBeNull()
    expect(container.querySelector('g.series-bar')).toBeNull()
  })

  it('trusts counted for the usage period, and the stamp for any other window', async () => {
    const period = unsubscribed(0)
    getUsage
      .mockResolvedValueOnce(usage([], { periodStart: period.periodStart }))
      .mockResolvedValueOnce(usage([day(recent(), 'p1', 10)], { periodStart: period.periodStart }))

    mount()
    await screen.findByText('Not counted yet', HEADLINE)

    pickRange('Last 30 days')
    await screen.findByText('10', HEADLINE)
  })

  it('keeps naming the billing period while a refetch replaces it', async () => {
    subscribe()
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'p1', 10)])).mockReturnValueOnce(new Promise(() => {}))

    const { rerender } = mount()
    await screen.findByText('10', HEADLINE)
    billing.current = { loaded: true, status: null }
    rerender(<Usage />)

    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2))
    expect(rangeChip()).toContain('Current billing period')
  })

  it('does not refetch when billing reloads the same period', async () => {
    subscribe()
    getUsage.mockResolvedValue(usage([day(recent(), 'p1', 10)]))

    const { rerender } = mount()
    await screen.findByText('10', HEADLINE)
    const { status } = billing.current
    billing.current = { loaded: true, status: status && clone(GetBillingStatusResponseSchema, status) }
    rerender(<Usage />)
    await act(async () => {})

    expect(getUsage).toHaveBeenCalledTimes(1)
  })

  it('still offers the rolling ranges, and the headline follows them', async () => {
    subscribe()
    getUsage
      .mockResolvedValueOnce(usage([day(recent(), 'p1', 10)]))
      .mockResolvedValueOnce(usage([day(recent(), 'p1', 10), day(daysAgo(60).toISOString(), 'p1', 5)]))

    mount()
    await screen.findByText('10', HEADLINE)
    pickRange('Last 90 days')

    await screen.findByText('15', HEADLINE)
    expect(screen.getByText(lastDays(90))).toBeTruthy()
  })
})

describe('Usage page: refusing to assert a zero', () => {
  it('reports unreadable rows instead of claiming there were no events', async () => {
    getUsage.mockResolvedValueOnce(usage([{ day: undefined, projectId: 'p1', eventCount: 900n } as UsageDay]))

    mount()

    await screen.findByText(/Usage could not be read for this window/)
    expect(headline()).toBe('Unknown')
    expect(screen.queryByText(/No metered events in this window/)).toBeNull()
  })

  it('still shows the totals when only some rows are unreadable', async () => {
    getUsage.mockResolvedValueOnce(
      usage([{ day: undefined, projectId: 'p1', eventCount: 900n } as UsageDay, day(recent(), 'p1', 10)]),
    )

    mount()

    await screen.findByText(/1 usage row could not be read/)
    expect(headline()).toBe('10')
  })

  it('reports out-of-window rows instead of claiming there were no events', async () => {
    getUsage.mockResolvedValueOnce(usage([day('2020-01-01T00:00:00Z', 'p1', 900)]))

    mount()

    await screen.findByText(/Usage could not be read for this window/)
    expect(headline()).toBe('Unknown')
    expect(screen.queryByText(/No metered events in this window/)).toBeNull()
  })

  // A sum of no rows is 0 in both halves, so only the pair discriminates.
  it('separates a never-metered org from one metered at zero', async () => {
    getUsage.mockResolvedValueOnce(usage([], { usageComputedAt: undefined }))
    const { unmount } = mount()
    await screen.findByText('Unknown', HEADLINE)
    expect(screen.getByText(/never been metered/)).toBeTruthy()
    unmount()

    getUsage.mockResolvedValueOnce(usage([]))
    mount()
    await screen.findByText('0', HEADLINE)
    expect(screen.getByText(/^Last metered/)).toBeTruthy()
  })

  it('says the tail of the window is unmetered rather than letting zero bars imply no usage', async () => {
    getUsage.mockResolvedValueOnce(
      usage([day(daysAgo(8).toISOString(), 'p1', 10)], { usageComputedAt: timestampFromDate(daysAgo(7)) }),
    )

    mount()

    await screen.findByText(/^The 7 days through today are unmetered, not zero/)
    expect(headline()).toBe('10')
  })

  it('counts a window from the first meter pass inside it', async () => {
    const { from } = lastNUtcDays(30)
    const stampedAt = (offsetMs: number) => ({
      usageComputedAt: timestampFromDate(new Date(from.getTime() + offsetMs)),
    })
    getUsage.mockResolvedValueOnce(usage([], stampedAt(-1)))
    const { unmount } = mount()
    await screen.findByText('Not counted yet', HEADLINE)
    unmount()

    getUsage.mockResolvedValueOnce(usage([day(from.toISOString(), 'p1', 10)], stampedAt(60 * 60 * 1000)))
    mount()
    await screen.findByText('10', HEADLINE)
  })

  it('warns when a window may have lost its newest days to the row cap', async () => {
    const cells = Array.from({ length: DAILY_ROW_CAP }, (_, i) =>
      day(daysAgo(i % 30).toISOString(), `p${Math.floor(i / 30)}`, 1),
    )
    getUsage.mockResolvedValueOnce(usage(cells))

    mount()

    await screen.findByText(/latest days may be missing from these totals/)
  })

  // protobuf-es hands back an Invalid Date for an out-of-range stamp, which Intl throws on mid-render.
  it('survives a meter stamp too large to be a date, rather than throwing mid-render', async () => {
    getUsage.mockResolvedValueOnce(usage([], { usageComputedAt: { seconds: 1754006400000000n, nanos: 0 } }))

    mount()

    await screen.findByText(/never been metered/)
  })
})

describe('Usage page: theme', () => {
  // Both halves are required: the palette is module state, and only themeRevision in the memo deps re-reads it.
  it('re-colours the breakdown when the theme flips', async () => {
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'p1', 10)]))

    const { container, store } = mount()
    await screen.findByText('10', HEADLINE)

    const dot = () => (container.querySelector('tbody tr td span span[style]') as HTMLElement).style.backgroundColor
    const light = dot()
    expect(light).not.toBe('')

    act(() => {
      setSeriesPalette(pugPalette('dark'))
      store.set(themeModeAtom, 'dark')
    })

    expect(dot()).not.toBe(light)
  })

  // Two dark themes share a polarity, so a memo keyed on light/dark never sees the switch.
  it('re-colours the breakdown when switching between two dark themes', async () => {
    getUsage.mockResolvedValueOnce(usage([day(recent(), 'p1', 10)]))

    const { container, store } = mount()
    await screen.findByText('10', HEADLINE)

    const dot = () => (container.querySelector('tbody tr td span span[style]') as HTMLElement).style.backgroundColor
    act(() => {
      store.set(themeModeAtom, 'dark')
      setSeriesPalette(store.get(compiledThemeAtom).data)
    })
    const pugDark = dot()

    const ember = {
      id: 'installed-ember' as const,
      text: JSON.stringify({
        version: 1,
        name: 'Ember',
        variants: { dark: { data: { categorical: ['#ff5f5f', '#ffaf00', '#5fd7ff'] } } },
      }),
      hash: 'ember',
      installedAt: 0,
      source: 'file' as const,
    }
    act(() => {
      store.set(installedThemesAtom, [ember])
      store.set(themeSelectionAtom, { light: 'pug', dark: ember.id })
      setSeriesPalette(store.get(compiledThemeAtom).data)
    })

    expect(dot()).not.toBe(pugDark)
  })
})

describe('Usage page: naming projects', () => {
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
