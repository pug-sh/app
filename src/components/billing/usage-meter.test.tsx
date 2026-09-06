import { create } from '@bufbuild/protobuf'
import { render, screen } from '@testing-library/react'
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

// Waiting on the mock alone passes while the response is still in flight, which makes every
// "renders nothing" assertion below vacuous.
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

  // Absent means no limit, so there is no fraction to show — and a bar at 0% would read as an org
  // that has sent nothing.
  it('renders nothing for a plan with no quota', async () => {
    getBillingStatus.mockResolvedValue(status({ includedEvents: undefined }))
    const { store } = renderMeter()
    await settled(store)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  // The period has not been summed, so there is no numerator. A meter reading "0 / 500K" would
  // state a figure the server never claimed, in the one place it is always on screen.
  it('renders nothing before the meter has counted', async () => {
    getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 0n, counted: false }))
    const { store } = renderMeter()
    await settled(store)
    expect(screen.queryByRole('progressbar')).toBeNull()
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
