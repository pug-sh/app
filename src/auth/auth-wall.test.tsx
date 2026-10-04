import { render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { expect, it } from 'vitest'
import { compiledThemeAtom, themeSelectionAtom } from '@/data/theme.atoms'
import { setSeriesPalette } from '@/lib/event-colors'
import { compileDataPalette } from '@/theme/data-palette'
import { PUG_CANVAS } from '@/theme/fit'
import { AuthWall } from './auth-wall'

// The sign-in pages stay Pug whatever theme someone picked: the CSS tokens reset under .auth-surface,
// and the wall's data colours have to follow, or a colourblind or custom palette is drawn on Pug's
// surface, fitted to a canvas that isn't there.
it("draws its cards in Pug's colours whatever theme is active", () => {
  const store = createStore()
  store.set(themeSelectionAtom, { light: 'pug-colourblind', dark: 'pug' })
  // What App does on every render: the active theme's palette goes into the colour module.
  setSeriesPalette(store.get(compiledThemeAtom).data)
  render(
    <Provider store={store}>
      <AuthWall />
    </Provider>,
  )

  const pug = compileDataPalette(undefined, 'light', 'standard', PUG_CANVAS.light).events.payment_failed.line
  expect(store.get(compiledThemeAtom).data.events.payment_failed.line).not.toBe(pug)
  const drawn = new Set(screen.getAllByText('payment_failed').map(el => el.style.color))
  expect([...drawn]).toEqual([pug])
})
