import { fireEvent, render, screen, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchedThemesAtom, installedThemesAtom } from '@/data/theme.atoms'
import { fakeResponse } from '@/test/fake-response'
import { serveByUrl } from '@/test/serve'
import { applyTheme, findTile, openTheme, panel, themeList, tile, tileNames } from '@/test/theme-gallery'
import { CLAY_LIST, clayFile, LIST_URL, listOf } from '@/test/theme-repository'
import type { InstalledTheme, RemoteId } from '@/theme/library'
import ThemePicker from './theme-picker'

const clay = JSON.stringify({ version: 1, name: 'Clay', variants: { light: { colors: { background: '#f3eee4' } } } })
const grape: InstalledTheme = {
  id: 'installed-grape',
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file',
}

const SET = 'Set as project default'

const mount = ({ current = '', fetched = {} }: { current?: string; fetched?: Record<RemoteId, string> } = {}) => {
  const onSave = vi.fn()
  const store = createStore()
  store.set(installedThemesAtom, [grape])
  store.set(fetchedThemesAtom, fetched)
  render(
    <Provider store={store}>
      <ThemePicker current={current} saving={false} onSave={onSave} />
    </Provider>,
  )
  return onSave
}

const choose = (name: string) => applyTheme(name, SET)

const check = (value: string) => {
  if (!screen.queryByLabelText('Theme URL')) fireEvent.click(screen.getByRole('button', { name: 'Add a theme' }))
  fireEvent.change(screen.getByLabelText('Theme URL'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('ThemePicker', () => {
  it('saves a built-in that follows the mode, straight from its button', async () => {
    const onSave = mount()
    await choose('Pug')
    expect(onSave).toHaveBeenCalledWith('pug')
  })

  it('leaves installed themes out of a project’s default', () => {
    mount()
    expect(within(themeList()).queryByRole('button', { name: 'Grape, Dark only' })).toBeNull()
  })

  it('saves nothing when a theme is opened', async () => {
    const onSave = mount()
    await openTheme('Pug')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reads Project default on the saved theme, and saves nothing from it', async () => {
    const onSave = mount({ current: 'pug#dark' })
    await openTheme('Pug')
    const held = within(panel()).getByRole('button', { name: 'Project default' })
    expect(held.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(held)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('holds its buttons while a save is in flight', async () => {
    const store = createStore()
    render(
      <Provider store={store}>
        <ThemePicker current="" saving onSave={() => {}} />
      </Provider>,
    )
    await openTheme('Pug')
    expect(within(panel()).getByRole('button', { name: SET }).getAttribute('aria-disabled')).toBe('true')
  })

  it('checks a URL, discloses its host, and saves the file’s URL with its one mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(clay)),
    )
    const onSave = mount()
    check('raw.githubusercontent.com/acme/brand/main/clay.json')
    expect(
      await screen.findByText('Members’ browsers will load this file from raw.githubusercontent.com.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: SET }))
    expect(onSave).toHaveBeenCalledWith('https://raw.githubusercontent.com/acme/brand/main/clay.json#light')
  })

  it('drops a pasted pin the file has no variant for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(clay)),
    )
    const onSave = mount()
    check('example.com/clay.json#dark')
    fireEvent.click(await screen.findByRole('button', { name: SET }))
    expect(onSave).toHaveBeenCalledWith('https://example.com/clay.json#light')
  })

  it('says why a URL can’t be used, and offers nothing to save', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    mount()
    check('cdn.example.com/brand.json')
    expect(
      await screen.findByText('Couldn’t reach the host, or it doesn’t let other sites read the file (CORS).'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: SET })).toBeNull()
  })

  it('lists a broken file’s errors instead of using it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse('{"version":1,"name":"Broken","variants":{}}')),
    )
    mount()
    check('https://example.com/broken.json')
    expect(await screen.findByText('This file can’t be used.')).toBeTruthy()
    expect(screen.getByText('A theme needs a light or a dark variant')).toBeTruthy()
    expect(screen.queryByRole('button', { name: SET })).toBeNull()
  })
})

describe('official themes', () => {
  const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json'

  it('shows every theme list.json names and no other, so a new theme needs no change here', async () => {
    const named = (name: string) => ({ version: 1, name, variants: { light: { colors: { background: '#fafafa' } } } })
    serveByUrl({
      [LIST_URL]: listOf(
        { slug: 'moss', releases: ['1.0.0'], latest: named('Moss') },
        { slug: 'slate', releases: ['1.0.0'], latest: named('Slate') },
        { slug: 'ember', releases: ['1.0.0'], latest: named('Ember') },
      ),
    })
    mount()
    await findTile('Moss, Light only')
    expect(tileNames()).toEqual(['Pug', 'Moss, Light only', 'Slate, Light only', 'Ember, Light only'])
  })

  it('lists them after the built-ins, with who made them and when', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    mount()
    await openTheme('Clay')
    expect(tileNames()).toEqual(['Pug', 'Clay'])
    expect(within(panel()).getByText('· by Pug · created Oct 2026 · themes.pug.sh')).toBeTruthy()
    expect(within(panel()).getByText('Warm linen paper.')).toBeTruthy()
  })

  it('starts on the newest major line, and saves that line’s URL with no read', async () => {
    const fetcher = serveByUrl({ [LIST_URL]: CLAY_LIST })
    const onSave = mount()
    await choose('Clay')
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/2/theme.json')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('saves a named repository’s own address', async () => {
    vi.stubEnv('VITE_THEME_REPOSITORY', 'https://themes.acme.com')
    serveByUrl({ 'https://themes.acme.com/list.json': CLAY_LIST })
    const onSave = mount()
    await choose('Clay')
    expect(onSave).toHaveBeenLastCalledWith('https://themes.acme.com/clay/2/theme.json')
  })

  it('doesn’t take a saved file from another repository for the catalog’s theme of that name', async () => {
    vi.stubEnv('VITE_THEME_REPOSITORY', 'https://themes.acme.com')
    serveByUrl({ 'https://themes.acme.com/list.json': CLAY_LIST })
    mount({ current: CLAY_1 })
    expect((await findTile('Clay')).getAttribute('aria-pressed')).toBe('false')
  })

  it('saves a pasted official URL on the pasted track', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    const onSave = mount()
    await findTile('Clay')
    check('themes.pug.sh/clay/1')
    fireEvent.click(await screen.findByRole('button', { name: SET }))
    expect(onSave).toHaveBeenLastCalledWith(CLAY_1)
  })

  it('says when the theme repository can’t be read, and keeps the built-ins', async () => {
    mount()
    expect(await screen.findByText('Couldn’t reach themes.pug.sh.')).toBeTruthy()
    expect(tile('Pug')).toBeTruthy()
  })

  it('says nothing about the theme repository while it loads', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    mount()
    expect(screen.queryByText(/Couldn’t reach/)).toBeNull()
  })

  it('presses the saved theme', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    mount({ current: CLAY_1 })
    expect((await findTile('Clay')).getAttribute('aria-pressed')).toBe('true')
  })

  it('presses a saved built-in the same way', () => {
    mount({ current: 'pug#dark' })
    expect(tile('Pug').getAttribute('aria-pressed')).toBe('true')
  })

  it('starts any other theme on its newest line', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const onSave = mount({ current: 'https://themes.pug.sh/paper/1/theme.json' })
    await choose('Clay')
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/2/theme.json')
  })

  it('draws the saved theme from the file it follows, not the catalog’s latest', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const followed = JSON.stringify({ ...clayFile('1.1.0'), name: 'Clay Classic' })
    mount({ current: CLAY_1, fetched: { [CLAY_1]: followed } })
    expect(await findTile('Clay Classic')).toBeTruthy()
  })
})
