import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { jwtFor } from '@/test/jwt'

const { getMe } = vi.hoisted(() => ({ getMe: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { customersRPCAtom: atom({ getMe }) }
})

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

const { SidebarProvider } = await import('@/components/ui/sidebar')
const { AccountMenu } = await import('./account-menu')
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')

const me = { customerId: 'cust-1', email: 'me@example.com', emailVerified: true }

const mount = () => {
  const store = createStore()
  store.set(refreshTokenAtom, 'refresh-token')
  store.set(jwtAtom, jwtFor('cust-1'))
  render(
    <Provider store={store}>
      <SidebarProvider>
        <AccountMenu />
      </SidebarProvider>
    </Provider>,
  )
}

describe('the account menu', () => {
  // The trigger sits outside <main>, so only its own marker keeps the address out of click capture.
  it('shows the signed-in address, kept out of autocapture', async () => {
    getMe.mockResolvedValue(me)
    mount()

    const trigger = await screen.findByRole('button', { name: 'Account, me@example.com' })
    expect(trigger.textContent).toContain('me@example.com')
    expect(trigger.closest('[data-pug-no-capture]')).not.toBeNull()
    expect(getMe).toHaveBeenCalledTimes(1)
  })

  it('asks again when the menu opens after a failed fetch', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getMe.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(me)
    mount()

    await waitFor(() => expect(console.error).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))

    expect(await screen.findByRole('button', { name: 'Account, me@example.com' })).toBeTruthy()
    expect(getMe).toHaveBeenCalledTimes(2)
  })
})
