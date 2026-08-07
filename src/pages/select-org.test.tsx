import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'

const { orgsCreate } = vi.hoisted(() => ({ orgsCreate: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    projectsRPCAtom: atom({ batchGet: vi.fn() }),
    orgsRPCAtom: atom({ list: vi.fn(), get: vi.fn(), create: orgsCreate, leave: vi.fn() }),
  }
})

// The sign-out button this page renders pulls analytics in through auth.atoms; stub the ingest so
// no test reaches for the network.
vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  isAnalyticsEnabled: () => false,
}))

const { orgsAtom } = await import('@/data/workspace.atoms')
const SelectOrg = (await import('./select-org')).default

describe('org creation from the picker', () => {
  it('rejects a name of nothing but spaces, and says so', async () => {
    const store = createStore()
    store.set(orgsAtom, [create(OrgSchema, { id: 'org-a', displayName: 'Acme', role: OrgRole.ADMIN })])
    render(
      <Provider store={store}>
        <SelectOrg />
      </Provider>,
    )

    fireEvent.click(screen.getByText('Create new organization'))
    const input = screen.getByPlaceholderText('Organization name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    // Same schema shape as the settings page's forms, and it has to stay that way: this is the other
    // door into createOrg, and it is the one a brand-new account walks through first.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Required'))
    expect(orgsCreate).not.toHaveBeenCalled()
  })
})
