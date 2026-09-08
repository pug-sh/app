import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { GetBillingStatusResponseSchema } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { GetUsageResponseSchema } from '@/api/genproto/dashboard/usage/v1/usage_pb'

const { getBillingStatus, getUsage } = vi.hoisted(() => ({ getBillingStatus: vi.fn(), getUsage: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { billingRPCAtom: atom({ getBillingStatus }), usageRPCAtom: atom({ getUsage }) }
})

const { billingAtom } = await import('@/data/billing.atoms')
const { activeOrgAtom } = await import('@/data/workspace.atoms')
const SettingsLayout = (await import('./settings-layout')).default

const org = create(OrgSchema, { id: 'org-a', displayName: 'A', role: OrgRole.ADMIN })

const mount = (path: string) => {
  const store = createStore()
  store.set(activeOrgAtom, org)
  const { hook } = memoryLocation({ path })
  render(
    <Provider store={store}>
      <Router hook={hook}>
        <Switch>
          <Route path="/p/:projectId/settings/*?">
            <SettingsLayout>
              <div>body</div>
            </SettingsLayout>
          </Route>
        </Switch>
      </Router>
    </Provider>,
  )
  return store
}

// The tab is kept while the answer is still coming, so every assertion about what the answer *did*
// has to wait for it — otherwise it reads the loading state and passes either way.
const settled = (store: ReturnType<typeof mount>) => waitFor(() => expect(store.get(billingAtom).loaded).toBe(true))

beforeEach(() => {
  vi.clearAllMocks()
  getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 1n, counted: true }))
})

describe('the billing tab', () => {
  it('is offered where the deployment bills', async () => {
    getBillingStatus.mockResolvedValue(create(GetBillingStatusResponseSchema, { billingEnabled: true }))
    await settled(mount('/p/p1/settings/general'))
    expect(screen.getByText('Billing')).toBeTruthy()
  })

  it('is dropped where billing is switched off', async () => {
    getBillingStatus.mockResolvedValue(create(GetBillingStatusResponseSchema, { billingEnabled: false }))
    await settled(mount('/p/p1/settings/general'))
    expect(screen.queryByText('Billing')).toBeNull()
  })

  // Dropping the tab you are standing on draws the bar with nothing highlighted.
  it('is kept while it is the tab being viewed', async () => {
    getBillingStatus.mockResolvedValue(create(GetBillingStatusResponseSchema, { billingEnabled: false }))
    await settled(mount('/p/p1/settings/billing'))
    expect(screen.getByText('Billing')).toBeTruthy()
  })

  // No billing service is the one failure the retry behind the tab cannot get past.
  it('is dropped where there is no billing service', async () => {
    getBillingStatus.mockRejectedValue(new ConnectError('nope', Code.Unimplemented))
    await settled(mount('/p/p1/settings/general'))
    expect(screen.queryByText('Billing')).toBeNull()
  })

  // Kept on any other failure, or the page that explains it is unreachable from the nav.
  it('is kept when the status could not be loaded', async () => {
    getBillingStatus.mockRejectedValue(new ConnectError('down', Code.Unavailable))
    await settled(mount('/p/p1/settings/general'))
    expect(screen.getByText('Billing')).toBeTruthy()
  })
})
