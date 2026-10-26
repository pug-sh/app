import { act, render, renderHook, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { installedThemesAtom, themeModeAtom, themeSelectionAtom } from '@/data/theme.atoms'
import { CRASHED, CrashBoundary } from '@/test/no-webgl'
import { useMaplibreMap, useMapTheme } from './use-maplibre-map'

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

// The smallest thing that mounts the hook into a real container.
const MapHarness = () => {
  const { containerRef, unavailable } = useMaplibreMap({ style: { version: 8, sources: {}, layers: [] } })
  return unavailable ? <p>unavailable</p> : <div ref={containerRef} />
}

// Only the browser's refusal is caught. Swallowing every constructor failure would draw "Map
// unavailable" over a real bug, and Sentry would never hear about it.
it('still lets any other construction failure reach the error boundary', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    throw new TypeError('not a GPU problem')
  })
  render(
    <CrashBoundary>
      <MapHarness />
    </CrashBoundary>,
  )

  screen.getByText(CRASHED)
})
