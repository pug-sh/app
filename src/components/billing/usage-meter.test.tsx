import { create } from '@bufbuild/protobuf'
import { act, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetBillingStatusResponseSchema } from '@/api/genproto/dashboard/billing/v1/billing_pb'
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
const { SidebarProvider } = await import('@/components/ui/sidebar')
const UsageMeter = (await import('./usage-meter')).default

type StatusFields = NonNullable<Parameters<typeof create<typeof GetBillingStatusResponseSchema>>[1]>

const status = (extra: StatusFields = {}) =>
  create(GetBillingStatusResponseSchema, { billingEnabled: true, includedEvents: 500_000n, ...extra } as StatusFields)

const renderMeter = () => {
  const store = createStore()
  store.set(activeOrgAtom, create(OrgSchema, { id: 'org-a', displayName: 'Org A', role: OrgRole.ADMIN }))
  const view = render(
    <Provider store={store}>
      <SidebarProvider>
        <UsageMeter href="/p/p1/settings/billing" />
      </SidebarProvider>
    </Provider>,
  )
  return { ...view, store }
}

// Waiting on the mock alone passes while the response is in flight, making every "renders nothing"
// assertion vacuous.
const settled = async (store: ReturnType<typeof createStore>) => {
  await vi.waitFor(() => expect(store.get(billingAtom).loaded).toBe(true))
}

beforeEach(() => {
  vi.clearAllMocks()
  getBillingStatus.mockResolvedValue(status())
  getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 120_000n, counted: true }))
})

describe('the sidebar usage meter', () => {
  it('shows the compact pair and the fill', async () => {
    renderMeter()
    expect(await screen.findByText('120K / 500K')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('24')
  })

  // No limit is no fraction, and a bar at 0% would read as an org that has sent nothing.
  it('renders nothing for a plan with no quota', async () => {
    getBillingStatus.mockResolvedValue(status({ includedEvents: undefined }))
    const { store } = renderMeter()
    await settled(store)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  // Unsummed, so "0 / 500K" would state a figure the server never claimed.
  it('renders nothing before the meter has counted', async () => {
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 0n, counted: false }))
    const { store } = renderMeter()
    await settled(store)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  // Collapsed, the only span carrying text is display:none — unlike the nav items, whose labels stay
  // in the DOM and are merely clipped — so without a name of its own the link is announced unnamed.
  it('names the link independently of the span the collapsed sidebar hides', async () => {
    renderMeter()
    expect(await screen.findByRole('link', { name: '120,000 of 500,000 events' })).toBeTruthy()
  })

  // Returning from the portal, where the plan can be cancelled, is a tab switch and not a mount — so
  // the refresh has to beat the 60s cache the four consumers share.
  it('re-reads the plan on a window focus', async () => {
    const { store } = renderMeter()
    await settled(store)
    expect(getBillingStatus).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    await vi.waitFor(() => expect(getBillingStatus).toHaveBeenCalledTimes(2))
  })

  it('renders nothing on a deployment with billing off', async () => {
    getBillingStatus.mockResolvedValue(
      create(GetBillingStatusResponseSchema, { billingEnabled: false, includedEvents: 500_000n }),
    )
    const { store } = renderMeter()
    await settled(store)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
