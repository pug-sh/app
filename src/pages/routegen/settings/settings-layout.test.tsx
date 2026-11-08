import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { GetBillingStatusResponseSchema } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { ListGrantsResponseSchema } from '@/api/genproto/dashboard/mcpgrants/v1/mcpgrants_pb'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { GetUsageResponseSchema } from '@/api/genproto/dashboard/usage/v1/usage_pb'
import { jwtFor } from '@/test/jwt'

const { getBillingStatus, getUsage, listGrants } = vi.hoisted(() => ({
  getBillingStatus: vi.fn(),
  getUsage: vi.fn(),
  listGrants: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    billingRPCAtom: atom({ getBillingStatus }),
    usageRPCAtom: atom({ getUsage }),
    mcpGrantsRPCAtom: atom({ listGrants }),
  }
})

const { billingAtom } = await import('@/data/billing.atoms')
const { activeOrgAtom } = await import('@/data/workspace.atoms')
const { jwtAtom } = await import('@/auth/jwt.atoms')
const { grantsAtom } = await import('./connected-apps/grants.atoms')
const SettingsLayout = (await import('./settings-layout')).default
const ConnectedApps = (await import('./connected-apps/index.page')).default

const org = create(OrgSchema, { id: 'org-a', displayName: 'A', role: OrgRole.ADMIN })

const mount = (path: string, role = OrgRole.ADMIN, body: ReactNode = <div>body</div>) => {
  const store = createStore()
  store.set(jwtAtom, jwtFor('cust-1'))
  store.set(activeOrgAtom, { ...org, role })
  const { hook } = memoryLocation({ path })
  render(
    <Provider store={store}>
      <Router hook={hook}>
        <Switch>
          <Route path="/p/:projectId/settings/*?">
            <SettingsLayout>{body}</SettingsLayout>
          </Route>
        </Switch>
      </Router>
    </Provider>,
  )
  return store
}

// The tab is kept while the answer is still coming, so every assertion about what the answer *did*
// has to wait for it, or it reads the loading state and passes either way.
const settled = (store: ReturnType<typeof mount>) => waitFor(() => expect(store.get(billingAtom).loaded).toBe(true))
const grantsSettled = (store: ReturnType<typeof mount>) => waitFor(() => expect(store.get(grantsAtom)).not.toBeNull())

beforeEach(() => {
  vi.clearAllMocks()
  getUsage.mockResolvedValue(create(GetUsageResponseSchema, { usedEvents: 1n, counted: true }))
  listGrants.mockResolvedValue(create(ListGrantsResponseSchema, { oauthEnabled: true }))
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

describe('the SSO & domains tab', () => {
  beforeEach(() => {
    getBillingStatus.mockResolvedValue(create(GetBillingStatusResponseSchema, { billingEnabled: false }))
  })

  it('is offered to an admin', async () => {
    await settled(mount('/p/p1/settings/general'))
    expect(screen.getByText('SSO & domains')).toBeTruthy()
  })

  it('is hidden from a member', async () => {
    await settled(mount('/p/p1/settings/general', OrgRole.MEMBER))
    expect(screen.queryByText('SSO & domains')).toBeNull()
  })
})

describe('the Connected apps tab', () => {
  beforeEach(() => {
    getBillingStatus.mockResolvedValue(create(GetBillingStatusResponseSchema, { billingEnabled: false }))
  })

  it('is offered where the server lets apps connect', async () => {
    await grantsSettled(mount('/p/p1/settings/general'))
    expect(screen.getByText('Connected apps')).toBeTruthy()
  })

  it('is dropped where OAuth is off', async () => {
    listGrants.mockResolvedValue(create(ListGrantsResponseSchema, { oauthEnabled: false }))
    await grantsSettled(mount('/p/p1/settings/general'))
    expect(screen.queryByText('Connected apps')).toBeNull()
  })

  it('is dropped where there is no such service', async () => {
    listGrants.mockRejectedValue(new ConnectError('nope', Code.Unimplemented))
    await grantsSettled(mount('/p/p1/settings/general'))
    expect(screen.queryByText('Connected apps')).toBeNull()
  })

  it('is kept when the list could not be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listGrants.mockRejectedValue(new ConnectError('down', Code.Unavailable))
    await grantsSettled(mount('/p/p1/settings/general'))
    expect(screen.getByText('Connected apps')).toBeTruthy()
  })

  it('is kept while it is the tab being viewed', async () => {
    listGrants.mockResolvedValue(create(ListGrantsResponseSchema, { oauthEnabled: false }))
    await grantsSettled(mount('/p/p1/settings/connected-apps'))
    expect(screen.getByText('Connected apps')).toBeTruthy()
  })

  // Both ask for the list as they mount.
  it('shares one request for the list with its page', async () => {
    await grantsSettled(mount('/p/p1/settings/connected-apps', OrgRole.ADMIN, <ConnectedApps />))
    expect(await screen.findByText('No apps are connected.')).toBeTruthy()
    expect(listGrants).toHaveBeenCalledOnce()
  })
})
