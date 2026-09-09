import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Code, ConnectError } from '@connectrpc/connect'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BillingStatus,
  CheckoutTheme,
  GetBillingStatusResponseSchema,
  PlanOptionSchema,
  SubscriptionStatus,
} from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { GetUsageResponseSchema } from '@/api/genproto/dashboard/usage/v1/usage_pb'

const { getBillingStatus, getUsage, listPlans, createCheckoutSession, createPortalSession, confirmCheckout } =
  vi.hoisted(() => ({
    getBillingStatus: vi.fn(),
    getUsage: vi.fn(),
    listPlans: vi.fn(),
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    confirmCheckout: vi.fn(),
  }))

const { toastError, toastInfo } = vi.hoisted(() => ({ toastError: vi.fn(), toastInfo: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: toastError, info: toastInfo, success: vi.fn() } }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    billingRPCAtom: atom({ getBillingStatus, listPlans, createCheckoutSession, createPortalSession, confirmCheckout }),
    usageRPCAtom: atom({ getUsage }),
  }
})

const { openCheckoutOverlay } = vi.hoisted(() => ({ openCheckoutOverlay: vi.fn() }))

vi.mock('./checkout', async importOriginal => ({
  ...(await importOriginal<typeof import('./checkout')>()),
  openCheckoutOverlay,
}))

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

const { activeOrgAtom } = await import('@/data/workspace.atoms')
const Billing = (await import('./index.page')).default

const org = (role: OrgRole) => create(OrgSchema, { id: 'org-a', displayName: 'Org A', role })

type StatusFields = NonNullable<Parameters<typeof create<typeof GetBillingStatusResponseSchema>>[1]>

const status = (extra: StatusFields = {}) =>
  create(GetBillingStatusResponseSchema, {
    billingEnabled: true,
    plan: { slug: 'growth', displayName: 'Growth', priceCents: 2_000n, currency: 'USD' },
    status: BillingStatus.ACTIVE,
    includedEvents: 500_000n,
    periodEnd: timestampFromDate(new Date('2026-07-10T00:00:00Z')),
    ...extra,
  } as StatusFields)

type PlanFields = NonNullable<Parameters<typeof create<typeof PlanOptionSchema>>[1]>

const plan = (slug: string, displayName: string, priceCents: bigint, purchasable = true, extra: PlanFields = {}) =>
  create(PlanOptionSchema, {
    slug,
    displayName,
    priceCents,
    currency: 'USD',
    includedEvents: 500_000n,
    purchasable,
    ...extra,
  } as PlanFields)

const renderPage = (role = OrgRole.ADMIN) => {
  const store = createStore()
  store.set(activeOrgAtom, org(role))
  return render(
    <Provider store={store}>
      <Billing />
    </Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getBillingStatus.mockResolvedValue(status())
  getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 120_000n, counted: true }))
  listPlans.mockResolvedValue({ plans: [] })
  openCheckoutOverlay.mockReturnValue(new Promise(() => {}))
})

describe('the plan section', () => {
  it('names the plan and its list price', async () => {
    renderPage()
    expect(await screen.findByText('Growth')).toBeTruthy()
    expect(screen.getByText('$20 / month')).toBeTruthy()
  })

  // The quota turns over on the org's anniversary; the subscription's period is when the provider
  // bills. Conflating them is the mistake the two fields exist to prevent.
  it('shows the billing date when there is one, and the quota reset otherwise', async () => {
    getBillingStatus.mockResolvedValue(
      status({ currentPeriodEnd: timestampFromDate(new Date('2026-06-28T00:00:00Z')) }),
    )
    renderPage()
    expect(await screen.findByText('Renews Jun 28, 2026')).toBeTruthy()

    vi.clearAllMocks()
    getBillingStatus.mockResolvedValue(status())
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 0n, counted: true }))
    listPlans.mockResolvedValue({ plans: [] })
    renderPage()
    expect(await screen.findByText('Quota resets Jul 10, 2026')).toBeTruthy()
  })

  it('names the history the plan keeps', async () => {
    getBillingStatus.mockResolvedValue(status({ retentionDays: 90n }))
    renderPage()
    expect(await screen.findByText('90 days of event history')).toBeTruthy()
  })

  // Absent is no bound at all, and "0 days of event history" is what it must never say.
  it('reads an absent bound as unlimited, not zero', async () => {
    renderPage()
    expect(await screen.findByText('Unlimited event history')).toBeTruthy()
  })

  // The server keeps the quota through PAST_DUE, so the page must not imply anything was cut off.
  it('says a payment failed without claiming the plan changed', async () => {
    getBillingStatus.mockResolvedValue(status({ subscriptionStatus: SubscriptionStatus.PAST_DUE, manageable: true }))
    renderPage()
    expect(await screen.findByText('Payment failed')).toBeTruthy()
    expect(screen.getByText(/Nothing has changed about your plan or your limits/)).toBeTruthy()
  })
})

describe('the usage section', () => {
  it('renders X of Y once the meter has counted', async () => {
    renderPage()
    expect(await screen.findByText('120,000')).toBeTruthy()
    expect(screen.getByText('/ 500,000')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('24')
  })

  // A period nobody has summed must never render as 0 — a figure the server never claimed.
  it('says not measured rather than zero', async () => {
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 0n, counted: false }))
    renderPage()
    expect(await screen.findByText('Not measured yet')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  // "Not measured yet" for a meter we never reached is a lie about a billing figure. The atom keeps
  // the two apart; this is the copy that has to.
  it('says the count is unavailable when the meter could not be read', async () => {
    getUsage.mockRejectedValue(new ConnectError('down', Code.Unavailable))
    renderPage()
    expect(await screen.findByText('Count unavailable')).toBeTruthy()
    expect(screen.queryByText('Not measured yet')).toBeNull()
  })

  // The bar needs both halves, and dropping the known one leaves a trialing org no number at all.
  it('still names the included quota when the meter has no count', async () => {
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 0n, counted: false }))
    renderPage()
    expect(await screen.findByText('Not measured yet')).toBeTruthy()
    expect(screen.getByText('500,000 events included this period.')).toBeTruthy()
  })

  // Absent means no limit at all, which is a plan without a bar rather than a bar at zero.
  it('draws no bar for a plan with no quota', async () => {
    getBillingStatus.mockResolvedValue(status({ includedEvents: undefined }))
    renderPage()
    expect(await screen.findByText('This plan has no event limit.')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  // Nothing is enforced, and unsaid that reads as an outage.
  it('says nothing is dropped when over the limit', async () => {
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 900_000n, counted: true }))
    renderPage()
    expect(await screen.findByText(/every event is still collected/)).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
  })
})

describe('the plan catalog', () => {
  it('offers the tiers this deployment sells', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [plan('growth', 'Growth', 2_000n), plan('scale', 'Scale', 3_000n)] })
    renderPage()

    await screen.findByText('Scale')
    // The current tier is marked, never offered.
    expect(screen.getByText('Current')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Choose Scale' })).toHaveLength(1)
  })

  it('names the quota and the history each tier keeps', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [plan('scale', 'Scale', 3_000n, true, { retentionDays: 90n })] })
    renderPage()
    expect(await screen.findByText('500,000 events / month · 90 days of event history')).toBeTruthy()
  })

  // Both numbers are absent on the custom tier, where the row must not trail a separator with
  // nothing after it.
  it('leaves the custom tier its one line', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({
      plans: [plan('custom', 'Custom', 0n, true, { priceCents: undefined, includedEvents: undefined })],
    })
    renderPage()
    expect(await screen.findByText('Quota agreed with us')).toBeTruthy()
    expect(screen.getByText('Agreed price')).toBeTruthy()
  })

  // The spinner replaces the button's only text and is aria-hidden, so an unlabelled button loses
  // its name exactly while it is busy.
  it('keeps the choose button named while its checkout opens', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [plan('scale', 'Scale', 3_000n)] })
    createCheckoutSession.mockImplementation(() => new Promise(() => {}))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Choose Scale' }))

    const button = await screen.findByRole('button', { name: 'Choose Scale' })
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'))
  })

  // The overlay opens over this page, so it follows the theme in effect rather than the
  // buyer's OS. 'system' is already resolved by the time it is sent.
  it.each([
    ['dark', CheckoutTheme.DARK],
    ['light', CheckoutTheme.LIGHT],
  ])('sends the %s the overlay opens over', async (theme, want) => {
    localStorage.setItem('pug:theme', JSON.stringify(theme))
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [plan('scale', 'Scale', 3_000n)] })
    createCheckoutSession.mockImplementation(() => new Promise(() => {}))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Choose Scale' }))

    await waitFor(() => expect(createCheckoutSession).toHaveBeenCalled())
    expect(createCheckoutSession.mock.calls[0][0]).toMatchObject({ theme: want })
  })

  // purchasable is the server's own "would a checkout open" — an unconfigured tier lists without
  // a button rather than with one that cannot work.
  it('does not offer a tier the server cannot check out', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true, plan: { slug: 'free', displayName: 'Free' } }))
    listPlans.mockResolvedValue({ plans: [plan('scale', 'Scale', 3_000n, false)] })
    renderPage()

    await screen.findByText('Scale')
    expect(screen.queryByRole('button', { name: 'Choose Scale' })).toBeNull()
  })

  // Spending money is admin-only on the server too.
  it('is hidden from a role that cannot start a checkout', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [plan('scale', 'Scale', 3_000n)] })
    renderPage(OrgRole.MEMBER)

    await screen.findByText('Growth')
    expect(screen.queryByText('Scale')).toBeNull()
    expect(listPlans).not.toHaveBeenCalled()
  })
})

describe('the portal', () => {
  // Not implied by a live subscription: a cancelled org has invoices to fetch and a card to re-add.
  it('offers the portal to an org with a payments customer', async () => {
    getBillingStatus.mockResolvedValue(status({ manageable: true, subscriptionStatus: SubscriptionStatus.UNSPECIFIED }))
    renderPage()
    expect(await screen.findByText('Manage payment method and invoices')).toBeTruthy()
  })

  it('offers nothing to an org that has never checked out', async () => {
    renderPage()
    await screen.findByText('Growth')
    expect(screen.queryByText('Manage payment method and invoices')).toBeNull()
  })

  // window.open returns null whenever noopener is asked for, so reading null as "blocked" dragged
  // this tab to the portal on every open.
  it('opens the portal in a new tab without taking the current one with it', async () => {
    const tab = { opener: {} } as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(tab)
    const before = window.location.href
    createPortalSession.mockResolvedValue({ portalUrl: 'https://portal.example/session' })
    getBillingStatus.mockResolvedValue(status({ manageable: true }))
    renderPage()

    fireEvent.click(await screen.findByText('Manage payment method and invoices'))
    await waitFor(() => expect(open).toHaveBeenCalled())

    expect(open.mock.calls[0][2]).toBeUndefined()
    expect(tab.opener).toBeNull()
    expect(window.location.href).toBe(before)
    open.mockRestore()
  })
})

// A retry can only fail the same way, so the page redirects instead — an error with a Try again
// button would be a button that cannot work.
describe('a deployment with no billing service', () => {
  it('shows no failure to retry', async () => {
    getBillingStatus.mockRejectedValue(new ConnectError('nope', Code.Unimplemented))
    renderPage()

    await waitFor(() => expect(getBillingStatus).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Try again')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

describe('the checkout outcome', () => {
  const PENDING_KEY = 'pug:billingCheckoutPending'

  // The record is written and cleared in one flush, so it is read at open time — otherwise a final
  // `toBeNull()` passes just as well when nothing was ever written.
  let pendingAtOpen: string | null = null

  const startCheckout = async (outcome: { status: string; message?: string }) => {
    openCheckoutOverlay.mockImplementation(async () => {
      pendingAtOpen = sessionStorage.getItem(PENDING_KEY)
      return outcome
    })
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [plan('scale', 'Scale', 3_000n)] })
    createCheckoutSession.mockResolvedValue({ checkoutUrl: 'https://test.dodo/x', sessionId: 'cs_9' })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Choose Scale' }))
    await waitFor(() => expect(openCheckoutOverlay).toHaveBeenCalled())
    expect(pendingAtOpen).toContain('cs_9')
  }

  beforeEach(() => {
    sessionStorage.clear()
    pendingAtOpen = null
  })

  // Left set, the next mount of this page confirms a checkout the customer walked away from.
  it('drops the session a failed checkout left behind', async () => {
    await startCheckout({ status: 'failed', message: 'Checkout could not be completed' })

    await waitFor(() => expect(sessionStorage.getItem(PENDING_KEY)).toBeNull())
    expect(toastError).toHaveBeenCalledWith('Checkout could not be completed')
  })

  // A charge can settle before the overlay reports itself closed. Not the poll, though: that would
  // promise an update to someone who just dismissed the form.
  it('asks whether a dismissed checkout settled before discarding it', async () => {
    confirmCheckout.mockResolvedValue({ confirmed: false })
    await startCheckout({ status: 'closed' })

    await waitFor(() => expect(confirmCheckout).toHaveBeenCalledWith({ orgId: 'org-a', sessionId: 'cs_9' }))
    await waitFor(() => expect(sessionStorage.getItem(PENDING_KEY)).toBeNull())
    expect(toastInfo).not.toHaveBeenCalled()
  })

  // Confirmed in the page, the record must not also survive for the return path to confirm a second
  // time — a duplicate is only refused after the card is charged.
  it('drops the session once a redirect has been confirmed in the page', async () => {
    confirmCheckout.mockResolvedValue({ confirmed: true })
    await startCheckout({ status: 'redirect' })

    await waitFor(() => expect(confirmCheckout).toHaveBeenCalledWith({ orgId: 'org-a', sessionId: 'cs_9' }))
    await waitFor(() => expect(sessionStorage.getItem(PENDING_KEY)).toBeNull())
  })
})

describe('the checkout return', () => {
  const PENDING_KEY = 'pug:billingCheckoutPending'

  const pending = (sessionId: string, orgId = 'org-a') =>
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ orgId, signature: 'stale-signature', sessionId }))

  beforeEach(() => sessionStorage.clear())

  // The session id has to survive the full-page redirect, or the buyer is back on the webhook.
  it('confirms the checkout the buyer just completed, by its session id', async () => {
    confirmCheckout.mockResolvedValue({ confirmed: true })
    pending('cs_1')
    renderPage()

    await waitFor(() => expect(confirmCheckout).toHaveBeenCalledWith({ orgId: 'org-a', sessionId: 'cs_1' }))
    expect(toastInfo).not.toHaveBeenCalled()
  })

  // "Not settled yet" is not a failure — the webhook is still coming.
  it('falls back to waiting when the provider has nothing yet', async () => {
    confirmCheckout.mockResolvedValue({ confirmed: false })
    pending('cs_1')
    renderPage()

    await waitFor(() => expect(confirmCheckout).toHaveBeenCalled())
    // The poll's own re-read, reached only because the confirm declined to answer.
    await waitFor(() => expect(getBillingStatus.mock.calls.length).toBeGreaterThan(1))
    expect(toastError).not.toHaveBeenCalled()
  })

  // The money is in and unplaceable — "updating shortly" is a lie for a payment needing a person.
  it('says a confirmed payment needs help rather than promising an update', async () => {
    confirmCheckout.mockRejectedValue(new ConnectError('unsupported currency', Code.FailedPrecondition))
    pending('cs_1')
    renderPage()

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastInfo).not.toHaveBeenCalled()
  })

  // A blip still has a webhook behind it, so it must reach the poll and not "contact support".
  it('falls back to waiting on a confirm that failed for a reason that may pass', async () => {
    confirmCheckout.mockRejectedValue(new ConnectError('unavailable', Code.Unavailable))
    pending('cs_1')
    renderPage()

    await waitFor(() => expect(getBillingStatus.mock.calls.length).toBeGreaterThan(1))
    expect(toastError).not.toHaveBeenCalled()
  })

  // Unread, a declined card polls for 17.5s and is then told its payment is still confirming.
  it('reports a declined card instead of polling for it', async () => {
    window.history.replaceState({}, '', '/?status=failed')
    pending('cs_1')
    renderPage()

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(confirmCheckout).not.toHaveBeenCalled()
    window.history.replaceState({}, '', '/')
  })

  // With no session handle the webhook is the only path left, so the poll still has to run.
  it('waits it out when there is no session id to confirm', async () => {
    pending('')
    renderPage()

    await waitFor(() => expect(getBillingStatus.mock.calls.length).toBeGreaterThan(1))
    expect(confirmCheckout).not.toHaveBeenCalled()
  })

  // A second tab moved the session's org while this one was at the provider: confirming would send
  // the wrong org's id, so the record waits for the org that started it.
  it('leaves a checkout started in another org for that org', async () => {
    pending('cs_1', 'org-b')
    renderPage()

    expect(await screen.findByText('Growth')).toBeTruthy()
    expect(confirmCheckout).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(PENDING_KEY)).toContain('cs_1')
  })
})

// With no billing at all, a blank body under a tab bar is worse than leaving for the general tab.
it('renders nothing when billing is switched off', async () => {
  getBillingStatus.mockResolvedValue(create(GetBillingStatusResponseSchema, { billingEnabled: false }))
  renderPage()
  await waitFor(() => expect(screen.queryByText('Growth')).toBeNull())
  expect(screen.queryByRole('progressbar')).toBeNull()
})
