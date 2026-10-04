import { render } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { jwtFor } from '@/test/jwt'

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  const pending = () => new Promise(() => {})
  return {
    projectsRPCAtom: atom({ batchGet: pending }),
    orgsRPCAtom: atom({ list: pending, get: pending, updateDisplayName: pending }),
    billingRPCAtom: atom({ getBillingStatus: pending }),
    usageRPCAtom: atom({ getUsage: pending }),
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

// Seeded before App loads: the theme atom reads storage when its module is first imported.
localStorage.setItem('pug:theme', JSON.stringify('dark'))
const { default: App } = await import('./App')
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')
const { getSeriesColor, setSeriesPalette } = await import('@/lib/event-colors')
const { compileDataPalette } = await import('@/theme/data-palette')
const { PUG_CANVAS } = await import('@/theme/fit')

it('colors series for the stored theme, not the OS one', () => {
  expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(false)
  const dark = compileDataPalette(undefined, 'dark', 'standard', PUG_CANVAS.dark).events.page_view
  setSeriesPalette(compileDataPalette(undefined, 'light', 'standard', PUG_CANVAS.light))
  expect(getSeriesColor('page_view')).not.toEqual(dark)

  const store = createStore()
  store.set(refreshTokenAtom, 'refresh-token')
  store.set(jwtAtom, jwtFor('cust-1'))
  render(
    <Provider store={store}>
      <Router hook={memoryLocation({ path: '/' }).hook}>
        <App />
      </Router>
    </Provider>,
  )

  expect(getSeriesColor('page_view')).toEqual(dark)
})
