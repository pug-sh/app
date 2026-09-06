import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Code, ConnectError } from '@connectrpc/connect'
import { render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BillingStatus,
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

const plan = (slug: string, displayName: string, priceCents: bigint, purchasable = true) =>
  create(PlanOptionSchema, {
    slug,
    displayName,
    priceCents,
    currency: 'USD',
    includedEvents: 500_000n,
    purchasable,
  })

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
})

describe('the plan section', () => {
  it('names the plan and its list price', async () => {
    renderPage()
    expect(await screen.findByText('Growth')).toBeTruthy()
    expect(screen.getByText('$20 / month')).toBeTruthy()
  })

  // The quota window turns over on the org's anniversary; the subscription's period is when the
  // provider bills. Conflating them is the mistake the two fields exist to prevent.
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

  // The card failed and the entitlement did not: the server keeps the quota through PAST_DUE, so
  // the page must say what happened without implying anything has been cut off.
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

  // A period nobody has summed yet must never render as 0 — that states a billing figure the
  // server never claimed.
  it('says not measured rather than zero', async () => {
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 0n, counted: false }))
    renderPage()
    expect(await screen.findByText('Not measured yet')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  // The entitlement is known even when the count is not, and the bar needs both. Dropping the known
  // half with the missing one leaves a trialing org no number anywhere on the page.
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

  // Nothing is enforced: going over is a banner, and the page has to say so or it reads as an
  // outage.
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
    expect(screen.getAllByRole('button', { name: 'Choose' })).toHaveLength(1)
  })

  // purchasable is the server's own answer to "would a checkout open". A button that cannot work
  // is worse than no button, so an unconfigured tier is listed without one.
  it('does not offer a tier the server cannot check out', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true, plan: { slug: 'free', displayName: 'Free' } }))
    listPlans.mockResolvedValue({ plans: [plan('scale', 'Scale', 3_000n, false)] })
    renderPage()

    await screen.findByText('Scale')
    expect(screen.queryByRole('button', { name: 'Choose' })).toBeNull()
  })

  // Spending money is admin-only on the server too, so a member sees the plan and the quota and no
  // way to buy.
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
  // manageable is not implied by having a live subscription: a cancelled org still has invoices to
  // fetch and a card to re-add.
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
})

describe('the checkout return', () => {
  const PENDING_KEY = 'pug:billingCheckoutPending'

  const pending = (sessionId: string) =>
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ signature: 'stale-signature', sessionId }))

  beforeEach(() => sessionStorage.clear())

  // The session id has to survive the provider's full-page redirect, or the returning buyer has
  // nothing to confirm against and is back to waiting on a webhook.
  it('confirms the checkout the buyer just completed, by its session id', async () => {
    confirmCheckout.mockResolvedValue({ confirmed: true })
    pending('cs_1')
    renderPage()

    await waitFor(() => expect(confirmCheckout).toHaveBeenCalledWith({ orgId: 'org-a', sessionId: 'cs_1' }))
    expect(toastInfo).not.toHaveBeenCalled()
  })

  // "Not settled yet" is not a failure. The webhook is still coming, so the poll has to take over.
  it('falls back to waiting when the provider has nothing yet', async () => {
    confirmCheckout.mockResolvedValue({ confirmed: false })
    pending('cs_1')
    renderPage()

    await waitFor(() => expect(confirmCheckout).toHaveBeenCalled())
    // The poll's own re-read, which only runs because the confirm declined to answer.
    await waitFor(() => expect(getBillingStatus.mock.calls.length).toBeGreaterThan(1))
    expect(toastError).not.toHaveBeenCalled()
  })

  // The money is in and pug cannot place it. "This page will update shortly" is a lie for a payment
  // that needs a person, so a terminal refusal must not reach the buyer as one.
  it('says a confirmed payment needs help rather than promising an update', async () => {
    confirmCheckout.mockRejectedValue(new ConnectError('unsupported currency', Code.FailedPrecondition))
    pending('cs_1')
    renderPage()

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastInfo).not.toHaveBeenCalled()
  })

  // A provider that returns no session handle, or a checkout started before this shipped. The
  // webhook is the only path left, so the poll must still run rather than the return doing nothing.
  it('waits it out when there is no session id to confirm', async () => {
    pending('')
    renderPage()

    await waitFor(() => expect(getBillingStatus.mock.calls.length).toBeGreaterThan(1))
    expect(confirmCheckout).not.toHaveBeenCalled()
  })
})

// A self-hosted deployment has no billing at all. A blank body under a tab bar is worse than the
// general tab, so the page leaves rather than rendering an empty shell.
it('renders nothing when billing is switched off', async () => {
  getBillingStatus.mockResolvedValue(create(GetBillingStatusResponseSchema, { billingEnabled: false }))
  renderPage()
  await waitFor(() => expect(screen.queryByText('Growth')).toBeNull())
  expect(screen.queryByRole('progressbar')).toBeNull()
})
