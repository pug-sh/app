import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetBillingStatusResponseSchema, SubscriptionStatus } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { GetUsageResponseSchema } from '@/api/genproto/dashboard/usage/v1/usage_pb'

const { getBillingStatus, getUsage } = vi.hoisted(() => ({ getBillingStatus: vi.fn(), getUsage: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { billingRPCAtom: atom({ getBillingStatus }), usageRPCAtom: atom({ getUsage }) }
})

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

const { billingAtom } = await import('@/data/billing.atoms')
const { activeOrgAtom } = await import('@/data/workspace.atoms')
const { jwtAtom } = await import('@/auth/jwt.atoms')
const { jwtFor } = await import('@/test/jwt')
const { isDemoSessionAtom } = await import('@/auth/demo')
const UsageBanner = (await import('./usage-banner')).default

type StatusFields = NonNullable<Parameters<typeof create<typeof GetBillingStatusResponseSchema>>[1]>

const status = (extra: StatusFields = {}) =>
  create(GetBillingStatusResponseSchema, {
    billingEnabled: true,
    includedEvents: 500_000n,
    periodEnd: timestampFromDate(new Date('2026-07-10T00:00:00Z')),
    ...extra,
  } as StatusFields)

const renderBanner = (role = OrgRole.ADMIN) => {
  const store = createStore()
  store.set(activeOrgAtom, create(OrgSchema, { id: 'org-a', displayName: 'Org A', role }))
  // Dismissal is stamped with the customer, so one browser outliving one account does not carry a
  // dismissal across sign-ins.
  store.set(jwtAtom, jwtFor('cust-1'))
  const view = render(
    <Provider store={store}>
      <UsageBanner />
    </Provider>,
  )
  return { ...view, store }
}

// Every "stays quiet" assertion below needs the answer to have LANDED, not merely to have been
// asked for. Waiting on the call alone passes while the response is still in flight and the banner
// has had no chance to render, which makes the assertion vacuous — the version of this file that
// waited on the mock could not tell a working guard from a missing one.
const settled = async (store: ReturnType<typeof createStore>) => {
  await vi.waitFor(() => expect(store.get(billingAtom).loaded).toBe(true))
}

const used = (n: number) => create(GetUsageResponseSchema, { usedEvents: BigInt(n), counted: true })

beforeEach(() => {
  vi.clearAllMocks()
  getBillingStatus.mockResolvedValue(status())
  getUsage.mockResolvedValue(used(10_000))
})

describe('the over-quota banner', () => {
  it('says nothing well under the limit', async () => {
    const { store } = renderBanner()
    await settled(store)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('warns near the limit', async () => {
    getUsage.mockResolvedValue(used(460_000))
    renderBanner()
    expect(await screen.findByText(/You've used 92% of the 500,000 events/)).toBeTruthy()
  })

  // Nothing is enforced anywhere in this system, so a banner that only said "over your limit" would
  // read as an outage the customer is already having.
  it('says nothing is being dropped when over', async () => {
    getUsage.mockResolvedValue(used(600_000))
    renderBanner()
    expect(await screen.findByText(/Nothing is being dropped/)).toBeTruthy()
  })

  // The card failed and the plan did not. This one outranks the quota, message AND tone: a banner
  // reading "your payment failed" in the amber of a soft warning understates the only thing here
  // that needs acting on. The usage is deliberately in the caution band, which is the one
  // combination where the two tones differ.
  it('reports a failed payment ahead of the quota, in its own tone', async () => {
    getBillingStatus.mockResolvedValue(status({ subscriptionStatus: SubscriptionStatus.PAST_DUE }))
    getUsage.mockResolvedValue(used(460_000))
    renderBanner()

    const message = await screen.findByText(/Your last payment failed/)
    expect(screen.queryByText(/You've used 92%/)).toBeNull()
    expect(message.className).toContain('negative')
    expect(message.className).not.toContain('caution')
  })

  // Billing off is the self-hosted shape, and the server omits the quota with it — so the guard is
  // asserted against a response that carries one anyway, which is the only way to see the flag
  // being read rather than the absent quota doing the work.
  it('stays quiet on a deployment with billing off', async () => {
    getBillingStatus.mockResolvedValue(
      create(GetBillingStatusResponseSchema, { billingEnabled: false, includedEvents: 500_000n }),
    )
    getUsage.mockResolvedValue(used(600_000))
    const { store } = renderBanner()
    await settled(store)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  // The demo signs everyone in as a shared viewer of someone else's org. Their quota is not the
  // visitor's business, and there is nothing they could do about it.
  it('stays quiet in the demo', async () => {
    getUsage.mockResolvedValue(used(600_000))
    const store = createStore()
    store.set(activeOrgAtom, create(OrgSchema, { id: 'org-a', displayName: 'Org A', role: OrgRole.VIEWER }))
    store.set(jwtAtom, jwtFor('cust-1'))
    store.set(isDemoSessionAtom, true)
    render(
      <Provider store={store}>
        <UsageBanner />
      </Provider>,
    )
    await vi.waitFor(() => expect(getBillingStatus).not.toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('stays dismissed for the rest of the period', async () => {
    getUsage.mockResolvedValue(used(460_000))
    const { unmount } = renderBanner()
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()

    unmount()
    const { store } = renderBanner()
    await settled(store)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  // Crossing from "nearly out" to "over" is new information, so it earns a fresh banner even after
  // the caution one was dismissed.
  it('comes back when the tone worsens', async () => {
    getUsage.mockResolvedValue(used(460_000))
    const { unmount } = renderBanner()
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    unmount()

    getUsage.mockResolvedValue(used(600_000))
    renderBanner()
    expect(await screen.findByText(/Nothing is being dropped/)).toBeTruthy()
  })
})
