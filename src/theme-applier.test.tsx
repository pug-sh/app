import { act, render } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

// An OS the test can flip, installed before App loads: the theme atoms read the OS when their module
// is first imported.
const DARK = '(prefers-color-scheme: dark)'
const os = { dark: false }
const listeners = new Set<() => void>()
vi.stubGlobal('matchMedia', (query: string) => ({
  media: query,
  get matches() {
    return query === DARK && os.dark
  },
  addEventListener: (_: string, fn: () => void) => {
    if (query === DARK) listeners.add(fn)
  },
  removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
}))

const { default: App } = await import('./App')
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')
const { compiledThemeAtom, installThemeAtom, removeThemeAtom, selectThemeAtom, themeModeAtom } = await import(
  '@/data/theme.atoms'
)
const { TOKENS } = await import('@/theme/tokens')

const root = document.documentElement
const inline = () => TOKENS.filter(t => root.style.getPropertyValue(`--${t}`) !== '')
const GRAPE = JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } })

const mount = () => {
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
  return store
}

afterEach(() => {
  os.dark = false
  root.className = ''
  root.removeAttribute('data-theme')
  root.removeAttribute('style')
})

// The first-paint script sets <html> once, before React. Everything after that — every mode change,
// selection and removal — reaches the page only through App, so these render the real one.
describe('the theme on <html>', () => {
  it('follows the mode as it changes', () => {
    const store = mount()
    act(() => store.set(themeModeAtom, 'dark'))
    expect(root.classList.contains('dark')).toBe(true)
    act(() => store.set(themeModeAtom, 'light'))
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('carries an installed theme as inline variables, and drops them when it is removed', () => {
    const store = mount()
    act(() => store.set(themeModeAtom, 'dark'))
    const result = store.set(installThemeAtom, GRAPE)
    if (!result.ok) throw new Error('grape did not install')
    act(() => store.set(selectThemeAtom, { polarity: 'dark', id: result.theme.id }))
    expect(root.style.getPropertyValue('--background')).toBe(store.get(compiledThemeAtom).vars['--background'])
    expect(inline()).toHaveLength(TOKENS.length)

    act(() => store.set(removeThemeAtom, result.theme.id))
    expect(inline()).toEqual([])
    expect(root.classList.contains('dark')).toBe(true)
  })

  // Light mode doesn't ask the OS, so nothing hears it change. Switching to System has to.
  it('reads the OS again when System mode comes back', () => {
    const store = mount()
    act(() => store.set(themeModeAtom, 'light'))
    act(() => {
      os.dark = true
      for (const fn of listeners) fn()
    })
    act(() => store.set(themeModeAtom, 'system'))
    expect(root.classList.contains('dark')).toBe(true)
  })
})
