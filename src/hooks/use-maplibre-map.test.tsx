import { act, renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { installedThemesAtom, themeModeAtom, themeSelectionAtom } from '@/data/theme.atoms'
import { useMapTheme } from './use-maplibre-map'

const GRAPE = {
  id: 'installed-grape' as const,
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file' as const,
}

// The maps restyle in effects keyed on this object. Two dark themes share a polarity, so keyed on
// light/dark it would never change between them and the basemap would keep the first one's colours.
it('changes between two dark themes, so the maps restyle', () => {
  const store = createStore()
  store.set(themeModeAtom, 'dark')
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const { result } = renderHook(() => useMapTheme(), { wrapper })
  const pugDark = result.current

  act(() => {
    store.set(installedThemesAtom, [GRAPE])
    store.set(themeSelectionAtom, { light: 'pug', dark: GRAPE.id })
  })

  expect(result.current).not.toBe(pugDark)
  expect(result.current.vars['--background']).not.toBe(pugDark.vars['--background'])
})
