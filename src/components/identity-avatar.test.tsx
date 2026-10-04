import { render } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { expect, it } from 'vitest'
import { installedThemesAtom, themeModeAtom, themeSelectionAtom } from '@/data/theme.atoms'
import IdentityAvatar from './identity-avatar'

const srcFor = (store: ReturnType<typeof createStore>, id: string) => {
  const { container, unmount } = render(
    <Provider store={store}>
      <IdentityAvatar id={id} />
    </Provider>,
  )
  const src = (container.querySelector('img') as HTMLImageElement).getAttribute('src') ?? ''
  unmount()
  return decodeURIComponent(src)
}

it('paints the disc from the active theme', () => {
  const store = createStore()
  store.set(themeModeAtom, 'light')
  expect(srcFor(store, 'visitor-1')).toMatch(/#(da8282|d38b59|b99b46|86ac62|51b48d|2cb2bf|73a0e2|a68fdb|cc83b4)/i)

  const lime = {
    id: 'installed-lime' as const,
    text: JSON.stringify({ version: 1, name: 'Lime', variants: { light: { data: { avatars: ['#d4f5a0'] } } } }),
    hash: 'lime',
    installedAt: 0,
    source: 'file' as const,
  }
  store.set(installedThemesAtom, [lime])
  store.set(themeSelectionAtom, { light: lime.id, dark: 'pug' })
  expect(srcFor(store, 'visitor-1')).toMatch(/d4f5a0/i)
})
