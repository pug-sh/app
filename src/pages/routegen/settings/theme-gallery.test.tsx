import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installedThemesAtom } from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import { serveByUrl } from '@/test/serve'
import { applyTheme, findTile, MOSS, openTheme, panel, themeList, tile, tileNames } from '@/test/theme-gallery'
import { LIST_URL, listOf } from '@/test/theme-repository'
import type { InstalledTheme } from '@/theme/library'
import ThemeGallery from './theme-gallery'

const light = (name: string) => ({
  slug: name.toLowerCase(),
  releases: ['1.0.0'],
  latest: { version: 1, name, variants: { light: { colors: { background: '#fafafa' } } } },
})
const listing = (...names: string[]) => listOf(...names.map(light))
const EIGHT = listing('Moss', 'Slate', 'Ember', 'Iris', 'Fern', 'Dune', 'Rust', 'Opal')
const OPAL_FILE = 'https://themes.pug.sh/opal/1/theme.json'

type Props = Partial<Parameters<typeof ThemeGallery>[0]>

const mount = (props: Props = {}, themes: InstalledTheme[] = []) => {
  const store = createStore()
  if (themes.length > 0) store.set(installedThemesAtom, themes)
  const onUse = vi.fn()
  const ui = (next: Props) => (
    <Provider store={store}>
      <ThemeGallery
        held={null}
        useLabel="Use this theme"
        heldLabel="In use"
        onUse={onUse}
        onUseFile={() => {}}
        {...next}
      />
    </Provider>
  )
  const { rerender } = render(ui(props))
  return { store, onUse, rerender: (next: Props) => rerender(ui(next)) }
}

const serve = (list: string) => serveByUrl({ [LIST_URL]: list })
const search = (value: string) => fireEvent.change(screen.getByLabelText('Search themes'), { target: { value } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('ThemeGallery toolbar', () => {
  it('shows only Add a theme with six themes or fewer', async () => {
    serve(listing('Moss', 'Slate', 'Ember'))
    mount()
    await findTile('Moss, Light only')
    expect(screen.queryByLabelText('Search themes')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a theme' })).toBeTruthy()
  })

  it('adds search, source and order above six', async () => {
    serve(listing('Moss', 'Slate', 'Ember', 'Iris'))
    mount()
    await findTile('Moss, Light only')
    expect(screen.getByLabelText('Search themes')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Order' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^All sources/ })).toBeTruthy()
  })

  // Review Focus 1: no control that's gone can hide a theme.
  it('drops a filter the toolbar no longer shows', async () => {
    serve(EIGHT)
    const { rerender } = mount()
    await findTile('Moss, Light only')
    search('moss')
    expect(tileNames()).toEqual(['Moss, Light only'])
    rerender({ requires: 'dark' })
    expect(screen.queryByLabelText('Search themes')).toBeNull()
    expect(tileNames()).toEqual(['Pug', 'Pug High Contrast', 'Pug Colourblind-safe'])
  })
})

describe('ThemeGallery groups', () => {
  it('names each group for a screen reader', async () => {
    serve(EIGHT)
    mount()
    await findTile('Moss, Light only')
    expect(screen.getByRole('group', { name: 'Built in' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'themes.pug.sh' })).toBeTruthy()
  })

  it('shows one row of a long group, and the rest on request', async () => {
    serve(EIGHT)
    mount()
    await findTile('Moss, Light only')
    const group = screen.getByRole('group', { name: 'themes.pug.sh' })
    const tiles = () => within(group).getAllByRole('button', { pressed: false })
    expect(tiles()).toHaveLength(3)
    fireEvent.click(within(group).getByRole('button', { name: 'Show all 8' }))
    expect(tiles()).toHaveLength(8)
    fireEvent.click(within(group).getByRole('button', { name: 'Show less' }))
    expect(tiles()).toHaveLength(3)
  })

  it('keeps the theme in use in a collapsed group', async () => {
    serve(EIGHT)
    mount({ held: { target: OPAL_FILE, family: null } })
    expect((await findTile('Opal, Light only')).getAttribute('aria-pressed')).toBe('true')
  })

  it('says when the theme repository can’t be read, and keeps what it last listed', async () => {
    serve(listing('Moss'))
    const { store } = mount()
    await findTile('Moss, Light only')
    serveByUrl({})
    await act(() => store.set(themeCatalogAtom))
    expect(screen.getByText('Couldn’t reach themes.pug.sh.')).toBeTruthy()
    expect(tile('Moss, Light only')).toBeTruthy()
  })

  it('says nothing about a repository while its first read loads', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    mount()
    expect(screen.queryByRole('group', { name: 'themes.pug.sh' })).toBeNull()
    expect(screen.queryByText(/Couldn’t reach/)).toBeNull()
  })

  it('reads as complete with no repository at all', () => {
    vi.stubEnv('VITE_PUG_SERVICES_ENABLED', '')
    const fetcher = serveByUrl({})
    mount()
    expect(screen.getByText('No theme repositories here yet.')).toBeTruthy()
    expect(screen.queryByText(/Couldn’t reach/)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('ThemeGallery flat lists', () => {
  const mounted = async () => {
    serve(EIGHT)
    mount()
    await findTile('Moss, Light only')
  }

  it('flattens a search across groups, and tiles carry their source', async () => {
    await mounted()
    search('o')
    expect(screen.queryByRole('group', { name: 'themes.pug.sh' })).toBeNull()
    expect(tile('Moss, Light only').textContent).toContain('themes.pug.sh')
  })

  it('says when nothing matches', async () => {
    await mounted()
    search('zzz')
    expect(screen.getByText('No theme matches that.')).toBeTruthy()
  })

  it('orders A to Z across every source', async () => {
    await mounted()
    fireEvent.click(screen.getByRole('button', { name: 'A to Z' }))
    expect(tileNames()[0]).toBe('Dune, Light only')
  })

  it('filters by source', async () => {
    await mounted()
    fireEvent.click(screen.getByRole('button', { name: /^All sources/ }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /^themes\.pug\.sh/ }))
    expect(within(themeList()).queryByRole('button', { name: 'Pug' })).toBeNull()
    expect(tileNames()).toHaveLength(8)
  })
})

describe('ThemeGallery panel', () => {
  it('opens one theme at a time, straight after its tile, and closes it on a second click', async () => {
    serveByUrl({})
    mount({}, [MOSS])
    await openTheme('Pug')
    expect(tile('Pug').nextElementSibling).toBe(panel())
    await openTheme('Moss')
    expect(screen.getAllByRole('region')).toHaveLength(1)
    fireEvent.click(tile('Moss'))
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('returns focus to the tile when its panel closes', async () => {
    serveByUrl({})
    mount()
    await openTheme('Pug')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }))
    expect(document.activeElement).toBe(tile('Pug'))
  })

  it('writes nothing when a theme opens or closes', async () => {
    serveByUrl({})
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { onUse } = mount({}, [MOSS])
    await openTheme('Pug')
    await openTheme('Moss')
    fireEvent.click(tile('Moss'))
    expect(setItem).not.toHaveBeenCalled()
    expect(onUse).not.toHaveBeenCalled()
  })

  it('hands the theme to its host', async () => {
    serveByUrl({})
    const { onUse } = mount({}, [MOSS])
    await applyTheme('Moss')
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: MOSS.id }))
  })
})

describe('ThemeGallery add a theme', () => {
  it('expands Add a theme in place, with a link and a file', () => {
    serveByUrl({})
    mount()
    expect(screen.queryByLabelText('Theme URL')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add a theme' }))
    expect(screen.getByLabelText('Theme URL')).toBeTruthy()
    expect(screen.getByLabelText('Theme file')).toBeTruthy()
  })

  it('offers a shared list only the link', () => {
    serveByUrl({})
    mount({ shared: true })
    fireEvent.click(screen.getByRole('button', { name: 'Add a theme' }))
    expect(screen.getByLabelText('Theme URL')).toBeTruthy()
    expect(screen.queryByLabelText('Theme file')).toBeNull()
  })
})
