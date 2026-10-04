import { act, render } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { expect, it, vi } from 'vitest'
import { compiledThemeAtom, installedThemesAtom, themeModeAtom, themeSelectionAtom } from '@/data/theme.atoms'
import { setSeriesPalette } from '@/lib/event-colors'
import { FunnelChart } from './funnel-chart'

const EMBER = {
  id: 'installed-ember',
  text: JSON.stringify({
    version: 1,
    name: 'Ember',
    variants: { dark: { data: { events: { page_view: '#ff5f5f' } } } },
  }),
  hash: 'ember',
  installedAt: 0,
  source: 'file' as const,
}

const series = [
  {
    label: 'All',
    color: '#888888',
    steps: [
      { name: 'page_view', count: 100 },
      { name: 'click', count: 40 },
    ],
  },
]

// Two dark themes share a polarity, so step colours cached on anything but the theme revision stay
// on the first theme's palette.
it('re-colours its steps when switching between two dark themes', () => {
  // happy-dom lays everything out at 0x0, and the vendored funnel measures itself and draws nothing
  // until it has a size.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 400 } as DOMRect)
  const store = createStore()
  store.set(themeModeAtom, 'dark')
  setSeriesPalette(store.get(compiledThemeAtom).data)
  const { container } = render(
    <Provider store={store}>
      <FunnelChart series={series} colorByStep />
    </Provider>,
  )
  const pugDark = store.get(compiledThemeAtom).data.events.page_view.line
  expect(container.innerHTML).toContain(pugDark)

  act(() => {
    store.set(installedThemesAtom, [EMBER])
    store.set(themeSelectionAtom, { light: 'pug', dark: EMBER.id })
    setSeriesPalette(store.get(compiledThemeAtom).data)
  })

  const ember = store.get(compiledThemeAtom).data.events.page_view.line
  expect(ember).not.toBe(pugDark)
  expect(container.innerHTML).toContain(ember)
})
