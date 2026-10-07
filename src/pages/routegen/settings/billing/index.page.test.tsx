import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Code, ConnectError } from '@connectrpc/connect'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BillingStatus,
  CheckoutTheme,
  GetBillingStatusResponseSchema,
  PlanOptionSchema,
  SubscriptionStatus,
  TierUsageSchema,
} from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { GetUsageResponseSchema } from '@/api/genproto/dashboard/usage/v1/usage_pb'
import { formatDateTime, formatLocalDate } from '@/lib/timestamp'

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
const { billingAtom } = await import('@/data/billing.atoms')
const Billing = (await import('./index.page')).default

const org = (role: OrgRole) => create(OrgSchema, { id: 'org-a', displayName: 'Org A', role })

type StatusFields = NonNullable<Parameters<typeof create<typeof GetBillingStatusResponseSchema>>[1]>

// An org with no subscription: the free allowance, and a banner beyond it.
const status = (extra: StatusFields = {}) =>
  create(GetBillingStatusResponseSchema, {
    billingEnabled: true,
    plan: { slug: 'free', displayName: 'Free' },
    status: BillingStatus.FREE,
    includedEvents: 500_000n,
    periodEnd: timestampFromDate(new Date('2026-07-10T00:00:00Z')),
    ...extra,
  } as StatusFields)

const DAY_MS = 24 * 60 * 60 * 1000

// Relative to the clock, since the page reads a period end in the past as one that has ended.
const renewsAt = new Date(Date.now() + 20 * DAY_MS)

// A live subscription, billed by tier past the allowance over the provider's own period.
const subscribed = (extra: StatusFields = {}) =>
  status({
    plan: { slug: 'usage-2026-10', displayName: 'Pay as you go' },
    status: BillingStatus.ACTIVE,
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    manageable: true,
    includedEvents: 100_000n,
    currentPeriodEnd: timestampFromDate(renewsAt),
    ...extra,
  } as StatusFields)

type PlanFields = NonNullable<Parameters<typeof create<typeof PlanOptionSchema>>[1]>

const plan = (slug: string, displayName: string, purchasable = true, extra: PlanFields = {}) =>
  create(PlanOptionSchema, {
    slug,
    displayName,
    includedEvents: 100_000n,
    purchasable,
    ...extra,
  } as PlanFields)

const usagePlan = (purchasable = true) => plan('usage-2026-10', 'Pay as you go', purchasable, { retentionDays: 365n })

// A deal's terms are the org's own once bought, so the server sends neither number.
const deal = () => plan('custom', 'Acme Enterprise', true, { includedEvents: undefined })

const renderPage = (role = OrgRole.ADMIN) => {
  const store = createStore()
  store.set(activeOrgAtom, org(role))
  const view = render(
    <Provider store={store}>
      <Billing />
    </Provider>,
  )
  return { ...view, store }
}

beforeEach(() => {
  vi.clearAllMocks()
  getBillingStatus.mockResolvedValue(status())
  getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 120_000n, counted: true }))
  listPlans.mockResolvedValue({ plans: [] })
  openCheckoutOverlay.mockReturnValue(new Promise(() => {}))
})

describe('the plan section', () => {
  it('names the plan', async () => {
    renderPage()
    expect(await screen.findByText('Free')).toBeTruthy()
  })

  // A free org's allowance turns over on its anniversary; a subscriber's is spent per billing period,
  // which ends when the provider bills. Conflating them is the mistake the two fields exist to prevent.
  it('shows the billing date when there is one, and the allowance reset otherwise', async () => {
    getBillingStatus.mockResolvedValue(subscribed())
    renderPage()
    // Built, not written out: a local date.
    expect(await screen.findByText(`Renews ${formatLocalDate(renewsAt)}`)).toBeTruthy()

    vi.clearAllMocks()
    getBillingStatus.mockResolvedValue(status())
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 0n, counted: true }))
    listPlans.mockResolvedValue({ plans: [] })
    renderPage()
    expect(await screen.findByText('Free allowance resets Jul 10, 2026')).toBeTruthy()
  })

  // The provider renews about an hour late, and a renewal whose payment never resolves holds the old
  // period, so an end already past is not a renewal to promise.
  it('says when a past billing period ended instead of promising a renewal', async () => {
    const endedAt = new Date(Date.now() - 2 * DAY_MS)
    getBillingStatus.mockResolvedValue(subscribed({ currentPeriodEnd: timestampFromDate(endedAt) }))
    renderPage()
    expect(await screen.findByText(`Billing period ended ${formatLocalDate(endedAt)}`)).toBeTruthy()
    expect(screen.queryByText(/^Renews/)).toBeNull()
  })

  // A declined card may not renew at all, so the date is when the period ends, not a renewal.
  it('does not promise a renewal while a payment has failed', async () => {
    getBillingStatus.mockResolvedValue(subscribed({ subscriptionStatus: SubscriptionStatus.PAST_DUE }))
    renderPage()
    expect(await screen.findByText(`Billing period ends ${formatLocalDate(renewsAt)}`)).toBeTruthy()
    expect(screen.queryByText(/^Renews/)).toBeNull()
  })

  // period_end is the usage period's, which is a free org's allowance turnover and not a subscriber's.
  it('gives a subscriber no allowance reset, even without a billing date', async () => {
    getBillingStatus.mockResolvedValue(subscribed({ currentPeriodEnd: undefined }))
    renderPage()
    await screen.findByText('Pay as you go')
    expect(screen.queryByText(/Free allowance resets/)).toBeNull()
  })

  it('names the free allowance', async () => {
    renderPage()
    expect(await screen.findByText('500,000 free events each month')).toBeTruthy()
  })

  // Absent is NO allowance, from a plan the server no longer knows. "0 free events" is the one
  // thing it must not say, and a bar at zero would say it too.
  it('says nothing of an allowance the server did not send', async () => {
    getBillingStatus.mockResolvedValue(status({ includedEvents: undefined }))
    renderPage()
    await screen.findByText('Free')
    expect(screen.queryByText(/free events/)).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
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

  // The server keeps the plan through PAST_DUE, so the page must not imply anything was cut off.
  it('says a payment failed without claiming the plan changed', async () => {
    getBillingStatus.mockResolvedValue(subscribed({ subscriptionStatus: SubscriptionStatus.PAST_DUE }))
    renderPage()
    expect(await screen.findByText('Payment failed')).toBeTruthy()
    expect(screen.getByText(/Nothing has changed about your plan or your free allowance/)).toBeTruthy()
  })

  // The provider's "update your card by", beside the notice it dates.
  it('dates the grace window beside a failed payment', async () => {
    getBillingStatus.mockResolvedValue(
      subscribed({
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        gracePeriodEndsAt: timestampFromDate(new Date('2099-01-15T12:00:00Z')),
      }),
    )
    renderPage()
    const by = formatDateTime(new Date('2099-01-15T12:00:00Z'))
    expect(await screen.findByText(new RegExp(`update your payment method by ${by} to avoid`))).toBeTruthy()
  })

  // Served until the server sees whether the provider held or cancelled, and "by" a date already
  // gone asks for the impossible.
  it('drops a grace deadline that has passed', async () => {
    getBillingStatus.mockResolvedValue(
      subscribed({
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        gracePeriodEndsAt: timestampFromDate(new Date('2020-01-15T12:00:00Z')),
      }),
    )
    renderPage()
    const notice = await screen.findByText(/We couldn't charge your card/)
    expect(notice.textContent).toContain('update your payment method to avoid')
  })
})

describe('the usage section', () => {
  // A subscriber's billed usage runs over the provider's period, so this total says which window it
  // counts; two undated "this period" figures invite a subtraction across different windows.
  it('dates the usage period it counts', async () => {
    getBillingStatus.mockResolvedValue(status({ periodStart: timestampFromDate(new Date('2026-06-10T00:00:00Z')) }))
    renderPage()
    expect(await screen.findByText(/Jun 10 – Jul 9, 2026 \(UTC\)/)).toBeTruthy()
  })

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

  // The bar needs both halves, and dropping the known one leaves the org no number at all.
  it('still names the free allowance when the meter has no count', async () => {
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 0n, counted: false }))
    renderPage()
    expect(await screen.findByText('Not measured yet')).toBeTruthy()
    expect(screen.getByText('500,000 free events each month')).toBeTruthy()
  })

  // Nothing is enforced, and unsaid that reads as an outage.
  it('says nothing is dropped when past the allowance', async () => {
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 900_000n, counted: true }))
    renderPage()
    expect(await screen.findByText(/every event is still collected/)).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
  })

  // A subscriber past the allowance is billed by tier over the provider's period, which is not the
  // window this count covers, so a bar against the allowance would read as over a limit there is no
  // longer any of.
  it("counts a subscriber's events without measuring them against the allowance", async () => {
    getBillingStatus.mockResolvedValue(subscribed())
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 1_234_567n, counted: true }))
    renderPage()
    expect(await screen.findByText('1,234,567')).toBeTruthy()
    expect(screen.queryByText('/ 100,000')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/every event is still collected/)).toBeNull()
  })
})

describe('billed usage', () => {
  const tier = (fromEvents: bigint, upToEvents: bigint | undefined, events = 0n) =>
    create(TierUsageSchema, { fromEvents, upToEvents, events })

  const statedTiers = [
    tier(100_000n, 2_000_000n, 1_234_567n),
    tier(2_000_000n, 15_000_000n),
    tier(15_000_000n, 50_000_000n),
    tier(50_000_000n, 100_000_000n),
    tier(100_000_000n, 250_000_000n),
    tier(250_000_000n, undefined),
  ]

  it('shows what each tier was reported at for a subscriber', async () => {
    getBillingStatus.mockResolvedValue(
      subscribed({ tierUsage: statedTiers, tierUsageAsOf: timestampFromDate(new Date(Date.now() - 5 * 60_000)) }),
    )
    renderPage()

    const table = await screen.findByRole('table')
    const first = within(table).getByText('100K – 2M').closest('tr')
    expect(first && within(first).getByText('1,234,567')).toBeTruthy()
    // The last tier is unbounded: its absent bound is open-ended, never a 0.
    expect(within(table).getByText('250M+')).toBeTruthy()
    expect(screen.getByText('5m ago')).toBeTruthy()
  })

  // Every tier's count is billed, the last as much as the first.
  it('totals every tier', async () => {
    getBillingStatus.mockResolvedValue(
      subscribed({
        tierUsage: [
          tier(100_000n, 2_000_000n, 1_900_000n),
          tier(2_000_000n, 15_000_000n, 13_000_000n),
          tier(15_000_000n, 50_000_000n, 35_000_000n),
          tier(50_000_000n, 100_000_000n, 50_000_000n),
          tier(100_000_000n, 250_000_000n, 150_000_000n),
          tier(250_000_000n, undefined, 12_345n),
        ],
      }),
    )
    renderPage()
    const total = (await screen.findByText('Total')).closest('tr')
    expect(total && within(total).getByText('249,912,345')).toBeTruthy()
  })

  // Until the period's first statement nothing has been reported, which is not a tier at 0.
  it('says nothing has been reported yet rather than drawing zeros', async () => {
    getBillingStatus.mockResolvedValue(subscribed({ tierUsage: [] }))
    renderPage()
    expect(await screen.findByText(/Nothing reported to the payment provider yet/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  // The provider's period, not the usage period the section above counts.
  it('dates the billing period the tiers cover', async () => {
    getBillingStatus.mockResolvedValue(subscribed({ tierUsage: statedTiers }))
    renderPage()
    const ending = formatLocalDate(renewsAt)
    expect(await screen.findByText(new RegExp(`in the billing period ending ${ending},`))).toBeTruthy()
  })

  // Nothing is stated past a period's end, so a period that has ended is not running any more.
  it('calls an ended period ended, not running', async () => {
    const endedAt = new Date(Date.now() - 2 * DAY_MS)
    getBillingStatus.mockResolvedValue(
      subscribed({ tierUsage: statedTiers, currentPeriodEnd: timestampFromDate(endedAt) }),
    )
    renderPage()
    const note = await screen.findByText(new RegExp(`in the billing period that ended ${formatLocalDate(endedAt)},`))
    expect(note.textContent).not.toContain('running count')
  })

  // Nothing bills an org with no subscription, so it has no tiers to show.
  it('is absent for an org with no subscription', async () => {
    renderPage()
    await screen.findByText('Free')
    expect(screen.queryByText('Billed usage')).toBeNull()
    expect(screen.queryByText(/Nothing reported to the payment provider yet/)).toBeNull()
  })
})

describe('the plan catalog', () => {
  const onUsagePlan = { slug: 'usage-2026-10', displayName: 'Pay as you go' }

  it('offers the plans this deployment sells', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true, plan: onUsagePlan }))
    listPlans.mockResolvedValue({ plans: [usagePlan(), deal()] })
    renderPage()

    await screen.findByText('Acme Enterprise')
    // The plan the org holds is marked, never offered.
    expect(screen.getByText('Current')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Subscribe to Pay as you go' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Subscribe to Acme Enterprise' })).toHaveLength(1)
  })

  // The allowance is what a plan is sold by now that no price reaches the page, and "100,000
  // events" alone reads as a cap.
  it('names the free allowance and the history each plan keeps', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [usagePlan()] })
    renderPage()
    expect(await screen.findByText('100,000 free events / month · 365 days of event history')).toBeTruthy()
  })

  // Both numbers are absent on a deal, where the row must not trail a separator with nothing after
  // it, nor read the absence as an allowance of 0.
  it('leaves a deal its one line', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [deal()] })
    renderPage()
    expect(await screen.findByText('Terms agreed with us')).toBeTruthy()
  })

  // The spinner replaces the button's only text and is aria-hidden, so an unlabelled button loses
  // its name exactly while it is busy.
  it('keeps the subscribe button named while its checkout opens', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [usagePlan()] })
    createCheckoutSession.mockImplementation(() => new Promise(() => {}))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Subscribe to Pay as you go' }))

    const button = await screen.findByRole('button', { name: 'Subscribe to Pay as you go' })
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
    listPlans.mockResolvedValue({ plans: [usagePlan()] })
    createCheckoutSession.mockImplementation(() => new Promise(() => {}))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Subscribe to Pay as you go' }))

    await waitFor(() => expect(createCheckoutSession).toHaveBeenCalled())
    expect(createCheckoutSession.mock.calls[0][0]).toMatchObject({ theme: want })
  })

  // purchasable is the server's own "would a checkout open" — an unconfigured plan lists without
  // a button rather than with one that cannot work.
  it('does not offer a plan the server cannot check out', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true, plan: { slug: 'free', displayName: 'Free' } }))
    listPlans.mockResolvedValue({ plans: [usagePlan(false)] })
    renderPage()

    await screen.findByText('Pay as you go')
    expect(screen.queryByRole('button', { name: 'Subscribe to Pay as you go' })).toBeNull()
  })

  // The server offers every plan on sale, and a staged deal, whatever the org already holds, so the
  // page is all that stops a subscriber paying for a second subscription the confirm then refuses.
  it('offers a live subscriber no second checkout, only the portal', async () => {
    getBillingStatus.mockResolvedValue(
      subscribed({ purchasable: true, plan: { slug: 'custom', displayName: 'Acme Enterprise' } }),
    )
    listPlans.mockResolvedValue({ plans: [usagePlan(), deal()] })
    renderPage()
    await screen.findByText('Pay as you go')
    expect(screen.queryByRole('button', { name: /^Subscribe to/ })).toBeNull()
    expect(screen.getByText('Change or cancel your plan in the billing portal.')).toBeTruthy()
    expect(screen.getByText('Change plan in the billing portal')).toBeTruthy()
  })

  // manageable reads false on a failed lookup: no portal button then, but no checkout either.
  it('keeps a live subscriber read-only when the portal cannot open', async () => {
    getBillingStatus.mockResolvedValue(
      subscribed({ purchasable: true, manageable: false, plan: { slug: 'custom', displayName: 'Acme Enterprise' } }),
    )
    listPlans.mockResolvedValue({ plans: [usagePlan(), deal()] })
    renderPage()
    await screen.findByText('Pay as you go')
    expect(screen.queryByRole('button', { name: /^Subscribe to/ })).toBeNull()
    expect(screen.queryByText('Change plan in the billing portal')).toBeNull()
  })

  // Spending money is admin-only on the server too.
  it('is hidden from a role that cannot start a checkout', async () => {
    getBillingStatus.mockResolvedValue(status({ purchasable: true }))
    listPlans.mockResolvedValue({ plans: [usagePlan()] })
    renderPage(OrgRole.MEMBER)

    await screen.findByText('Free')
    expect(screen.queryByText('Pay as you go')).toBeNull()
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
    await screen.findByText('Free')
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
    listPlans.mockResolvedValue({ plans: [usagePlan()] })
    createCheckoutSession.mockResolvedValue({ checkoutUrl: 'https://test.dodo/x', sessionId: 'cs_9' })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Subscribe to Pay as you go' }))
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

    expect(await screen.findByText('Free')).toBeTruthy()
    expect(confirmCheckout).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(PENDING_KEY)).toContain('cs_1')
  })
})

// With no billing at all, a blank body under a tab bar is worse than leaving for the general tab.
// Waits on the answer having landed: before it the page is a spinner, so any "renders nothing" passes.
it('renders nothing when billing is switched off', async () => {
  getBillingStatus.mockResolvedValue(create(GetBillingStatusResponseSchema, { billingEnabled: false }))
  const { store } = renderPage()
  await waitFor(() => expect(store.get(billingAtom).loaded).toBe(true))
  await waitFor(() => expect(screen.queryByText('Events this period')).toBeNull())
  expect(screen.queryByRole('progressbar')).toBeNull()
})
