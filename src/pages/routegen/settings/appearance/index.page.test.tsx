import { fireEvent, render, screen, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { trackEvent } = await import('@/analytics/pug')
const { toast } = await import('sonner')
const { installedThemesAtom, STORAGE_REFUSED, themeModeAtom, themeSelectionAtom } = await import('@/data/theme.atoms')
const Appearance = (await import('./index.page')).default

const grape = JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } })

const mount = () => {
  const store = createStore()
  render(
    <Provider store={store}>
      <Appearance />
    </Provider>,
  )
  return store
}

const pick = (text: string, name = 'theme.json') =>
  fireEvent.change(screen.getByLabelText('Theme file'), { target: { files: [new File([text], name)] } })

// restoreMocks does not clear call history.
beforeEach(() => {
  vi.mocked(trackEvent).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('Settings → Appearance', () => {
  it('sets the mode', () => {
    const store = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(store.get(themeModeAtom)).toBe('dark')
  })

  // Review Focus 5: swatches are real buttons, named by their theme, carrying their state — and each
  // row is a labelled group, or a screen reader hears "Pug, pressed" twice with nothing to say which
  // mode either one sets.
  it('offers each built-in as a pressable button inside a labelled group per mode', () => {
    mount()
    for (const mode of ['Light theme', 'Dark theme']) {
      const row = screen.getByRole('group', { name: mode })
      expect(within(row).getByRole('button', { name: 'Pug' }).getAttribute('aria-pressed')).toBe('true')
      expect(within(row).getByRole('button', { name: 'Pug High Contrast' }).getAttribute('aria-pressed')).toBe('false')
    }
  })

  it('installs a clean file, lists it, and selects it for its mode', async () => {
    const store = mount()
    pick(grape)
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Grape')).toBeTruthy()
    expect(toast.success).toHaveBeenCalledWith('Installed Grape')

    fireEvent.click(screen.getByRole('button', { name: 'Grape' }))
    const id = store.get(installedThemesAtom)[0].id
    expect(store.get(themeSelectionAtom)).toEqual({ light: 'pug', dark: id })
    expect(trackEvent).toHaveBeenCalledWith('theme_selected', { theme: 'custom', mode: 'dark' })
  })

  // Review Focus 2
  it('refuses a file that is not a theme', async () => {
    mount()
    pick('\u0089PNG\r\n', 'logo.png')
    expect(await screen.findByText('Not valid JSON')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('refuses a duplicate', async () => {
    mount()
    pick(grape)
    await screen.findByRole('table')
    pick(grape)
    expect(await screen.findByText('Already installed.')).toBeTruthy()
  })

  it('asks before installing a theme with warnings', async () => {
    const store = mount()
    pick(JSON.stringify({ version: 1, name: 'Muddy', variants: { light: { colors: { foreground: '#bbbbbb' } } } }))
    fireEvent.click(await screen.findByRole('button', { name: 'Install anyway' }))
    expect(store.get(installedThemesAtom)).toHaveLength(1)
  })

  // Review Focus 3
  it('shows a theme name containing markup as plain text', async () => {
    mount()
    const name = '<img src=x onerror=alert(1)>'
    pick(JSON.stringify({ version: 1, name, variants: { dark: { colors: { background: '#1e1b2e' } } } }))
    const table = await screen.findByRole('table')
    expect(within(table).getByText(name)).toBeTruthy()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('removes a theme on the second click and falls its mode back to Pug', async () => {
    const store = mount()
    pick(grape)
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: 'Grape' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove theme' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    expect(store.get(installedThemesAtom)).toEqual([])
    expect(store.get(themeSelectionAtom).dark).toBe('pug')
  })

  // A full quota or a blocked profile: the choice can't be kept, and saying nothing would leave the
  // page looking as if the click did nothing at all.
  it('says so when the browser refuses to save a choice, and keeps the old one', () => {
    mount()
    const refusal = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      const row = screen.getByRole('group', { name: 'Light theme' })
      fireEvent.click(within(row).getByRole('button', { name: 'Pug High Contrast' }))
      expect(toast.error).toHaveBeenCalledWith(STORAGE_REFUSED)
      expect(within(row).getByRole('button', { name: 'Pug' }).getAttribute('aria-pressed')).toBe('true')

      fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
      expect(toast.error).toHaveBeenCalledTimes(2)
    } finally {
      refusal.mockRestore()
    }
  })
})
