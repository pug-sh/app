import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchedThemesAtom, installedThemesAtom } from '@/data/theme.atoms'
import { fakeResponse } from '@/test/fake-response'
import { serveByUrl } from '@/test/serve'
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

const mount = ({
  shared = true,
  current,
  fetched = {},
}: {
  shared?: boolean
  current?: string
  fetched?: Record<RemoteId, string>
} = {}) => {
  const onSave = vi.fn()
  const store = createStore()
  store.set(installedThemesAtom, [grape])
  store.set(fetchedThemesAtom, fetched)
  render(
    <Provider store={store}>
      <ThemePicker
        shared={shared}
        current={current}
        followLabel="Follow each member’s mode"
        saveLabel="Save default theme"
        onSave={onSave}
      />
    </Provider>,
  )
  return onSave
}

const pickSwatch = (name: string) =>
  fireEvent.click(within(screen.getByRole('group', { name: 'Themes' })).getByRole('button', { name }))

const check = (value: string) => {
  fireEvent.change(screen.getByLabelText('Theme URL'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
}

afterEach(() => vi.unstubAllGlobals())

describe('ThemePicker', () => {
  it('saves a built-in that follows the mode', () => {
    const onSave = mount()
    pickSwatch('Pug Colourblind-safe')
    fireEvent.click(screen.getByRole('button', { name: 'Save default theme' }))
    expect(onSave).toHaveBeenCalledWith('pug-colourblind')
  })

  it('saves a built-in pinned to a mode', () => {
    const onSave = mount()
    pickSwatch('Pug Colourblind-safe')
    fireEvent.click(screen.getByRole('button', { name: 'Always dark' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save default theme' }))
    expect(onSave).toHaveBeenCalledWith('pug-colourblind#dark')
  })

  it('leaves installed themes out of a project’s default', () => {
    mount()
    expect(within(screen.getByRole('group', { name: 'Themes' })).queryByRole('button', { name: 'Grape' })).toBeNull()
  })

  it('pins a single-variant installed theme to its only mode', () => {
    const onSave = mount({ shared: false })
    pickSwatch('Grape')
    expect(screen.getByText('Grape has only a dark variant.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save default theme' }))
    expect(onSave).toHaveBeenCalledWith('installed-grape#dark')
  })

  it('checks a URL, discloses its host, and saves the file’s URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(clay)),
    )
    const onSave = mount()
    check('raw.githubusercontent.com/acme/brand/main/clay.json')
    expect(
      await screen.findByText('Members’ browsers will load this file from raw.githubusercontent.com.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use this theme' }))
    expect(screen.getByRole('button', { name: 'Always light' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('button', { name: 'Always dark' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save default theme' }))
    expect(onSave).toHaveBeenCalledWith('https://raw.githubusercontent.com/acme/brand/main/clay.json#light')
  })

  it('drops a pasted pin the file has no variant for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(clay)),
    )
    const onSave = mount()
    check('example.com/clay.json#dark')
    fireEvent.click(await screen.findByRole('button', { name: 'Use this theme' }))
    expect(screen.getByRole('button', { name: 'Always light' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Save default theme' }))
    expect(onSave).toHaveBeenCalledWith('https://example.com/clay.json#light')
  })

  it('says why a URL can’t be used, and offers nothing to use', async () => {
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
    expect(screen.queryByRole('button', { name: 'Use this theme' })).toBeNull()
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
    expect(screen.queryByRole('button', { name: 'Use this theme' })).toBeNull()
  })
})

describe('official themes', () => {
  const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json'
  const CLAY_ONE_RELEASE = 'https://themes.pug.sh/clay/1.0.0/theme.json'
  const LIGHT_ONLY = JSON.stringify({ ...clayFile('1.0.0'), variants: { light: clayFile('1.0.0').variants.light } })

  const themes = () => screen.getByRole('group', { name: 'Themes' })
  const names = () =>
    within(themes())
      .getAllByRole('button')
      .map(swatch => swatch.textContent)
  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save default theme' }))
  const saveButton = () => screen.getByRole('button', { name: 'Save default theme' }) as HTMLButtonElement
  const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')
  const alwaysDark = () => screen.getByRole('button', { name: 'Always dark' }) as HTMLButtonElement
  const pickClay = async () => fireEvent.click(await within(themes()).findByRole('button', { name: 'Clay' }))
  const onlyRelease = async (release: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Only one release' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: release }))
  }

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
    await within(themes()).findByRole('button', { name: 'Moss' })
    expect(names()).toEqual(['Pug', 'Pug High Contrast', 'Pug Colourblind-safe', 'Moss', 'Slate', 'Ember'])
  })

  it('lists them after the built-ins, with who made them and when', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    mount()
    await pickClay()
    expect(names()).toEqual(['Pug', 'Pug High Contrast', 'Pug Colourblind-safe', 'Clay'])
    expect(screen.getByText('· by Pug · created Oct 2026 · themes.pug.sh')).toBeTruthy()
    expect(screen.getByText('Warm linen paper.')).toBeTruthy()
  })

  it('starts on the newest major line, and saves that line’s URL', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const onSave = mount()
    fireEvent.click(await within(themes()).findByRole('button', { name: 'Clay' }))
    expect(screen.getByRole('button', { name: 'Follow 2.x' }).getAttribute('aria-pressed')).toBe('true')
    save()
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/2/theme.json')
  })

  it('follows the latest, or pins one release, and keeps a mode pin', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_ONE_RELEASE]: JSON.stringify(clayFile('1.0.0')) })
    const onSave = mount()
    fireEvent.click(await within(themes()).findByRole('button', { name: 'Clay' }))
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Always dark' }))
    save()
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/theme.json#dark')
    await onlyRelease('1.0.0')
    await waitFor(() => expect(saveButton().disabled).toBe(false))
    save()
    expect(onSave).toHaveBeenLastCalledWith(`${CLAY_ONE_RELEASE}#dark`)
  })

  it('treats a pasted official URL as official, on the pasted track', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, 'https://themes.pug.sh/clay/1/theme.json': JSON.stringify(clayFile('1.1.0')) })
    const onSave = mount()
    await within(themes()).findByRole('button', { name: 'Clay' })
    check('themes.pug.sh/clay/1')
    fireEvent.click(await screen.findByRole('button', { name: 'Use this theme' }))
    expect(screen.getByRole('button', { name: 'Follow 1.x' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('2.0.0 is out. You stay on 1.x until you switch.')).toBeTruthy()
    save()
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/1/theme.json')
  })

  it('says when the theme list can’t be loaded, and keeps the built-ins', async () => {
    mount()
    expect(await screen.findByText('Couldn’t load the theme list.')).toBeTruthy()
    expect(within(themes()).getByRole('button', { name: 'Pug' })).toBeTruthy()
  })

  it('says nothing about the theme list while it loads', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    mount()
    expect(screen.queryByText('Couldn’t load the theme list.')).toBeNull()
  })

  // The spec: "The current choice keeps its track." Clicking the swatch again used to start over on the
  // newest major line, and forget the mode as well.
  it('leaves a pick’s track and mode alone when its swatch is clicked again', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    mount()
    await pickClay()
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    fireEvent.click(alwaysDark())
    await pickClay()
    expect(pressed('Latest')).toBe('true')
    expect(pressed('Always dark')).toBe('true')
  })

  it('presses the saved theme, and says what it won’t reach, before anything is picked', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    mount({ current: CLAY_1 })
    const clayButton = await within(themes()).findByRole('button', { name: 'Clay' })
    expect(clayButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('2.0.0 is out. You stay on 1.x until you switch.')).toBeTruthy()
  })

  it('presses a saved built-in the same way', () => {
    mount({ current: 'pug-colourblind#dark' })
    const swatch = within(themes()).getByRole('button', { name: 'Pug Colourblind-safe' })
    expect(swatch.getAttribute('aria-pressed')).toBe('true')
  })

  it('gives the saved theme back with its track and mode, not the newest line', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    const onSave = mount({ current: `${CLAY_1}#dark` })
    await pickClay()
    expect(pressed('Follow 1.x')).toBe('true')
    await waitFor(() => expect(pressed('Always dark')).toBe('true'))
    await waitFor(() => expect(saveButton().disabled).toBe(false))
    save()
    expect(onSave).toHaveBeenLastCalledWith(`${CLAY_1}#dark`)
  })

  it('still gives the saved theme back after another pick', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    mount({ current: CLAY_1 })
    await within(themes()).findByRole('button', { name: 'Clay' })
    pickSwatch('Pug')
    await pickClay()
    expect(pressed('Follow 1.x')).toBe('true')
  })

  it('starts any other theme on its newest line', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    mount({ current: 'https://themes.pug.sh/paper/1/theme.json' })
    await pickClay()
    expect(pressed('Follow 2.x')).toBe('true')
  })

  it('draws the saved theme from the file it follows, not the catalog’s latest', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const followed = JSON.stringify({ ...clayFile('1.1.0'), name: 'Clay Classic' })
    mount({ current: CLAY_1, fetched: { [CLAY_1]: followed } })
    expect(await within(themes()).findByRole('button', { name: 'Clay Classic' })).toBeTruthy()
  })

  // The catalog embeds only the latest file. Going by it, a light-only release looked like it had both modes
  // and saved with no pin, so dark members got Pug with nothing to say why.
  it('reads a release it moves to, and offers only the modes that release has', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_ONE_RELEASE]: LIGHT_ONLY })
    const onSave = mount()
    await pickClay()
    await onlyRelease('1.0.0')
    expect(await screen.findByText('Clay has only a light variant.')).toBeTruthy()
    expect(alwaysDark().disabled).toBe(true)
    save()
    expect(onSave).toHaveBeenLastCalledWith(`${CLAY_ONE_RELEASE}#light`)
  })

  it('moves a chosen mode to the one a release has', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_ONE_RELEASE]: LIGHT_ONLY })
    const onSave = mount()
    await pickClay()
    fireEvent.click(alwaysDark())
    await onlyRelease('1.0.0')
    await screen.findByText('Clay has only a light variant.')
    save()
    expect(onSave).toHaveBeenLastCalledWith(`${CLAY_ONE_RELEASE}#light`)
  })

  it('needs no read for a track that reaches the latest', async () => {
    const fetcher = serveByUrl({ [LIST_URL]: CLAY_LIST })
    const onSave = mount()
    await pickClay()
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    save()
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/theme.json')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('holds Save until a release has been read', async () => {
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === LIST_URL) return Promise.resolve(fakeResponse(CLAY_LIST))
        return new Promise<Response>(resolve => {
          answer = resolve
        })
      }),
    )
    mount()
    await pickClay()
    await onlyRelease('1.0.0')
    expect(screen.getByText('Checking the file…')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
    await act(async () => answer(fakeResponse(LIGHT_ONLY)))
    await waitFor(() => expect(saveButton().disabled).toBe(false))
  })

  it('won’t save a release it couldn’t read, and says why', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    mount()
    await pickClay()
    await onlyRelease('1.0.0')
    expect(await screen.findByText('Last check failed: the host answered 404.')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('drops a single-variant file’s own pin on moving to a file with both modes', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_ONE_RELEASE]: LIGHT_ONLY })
    const onSave = mount()
    await within(themes()).findByRole('button', { name: 'Clay' })
    check(CLAY_ONE_RELEASE)
    fireEvent.click(await screen.findByRole('button', { name: 'Use this theme' }))
    expect(pressed('Always light')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    expect(alwaysDark().disabled).toBe(false)
    expect(screen.queryByText(/has only/)).toBeNull()
    save()
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/theme.json')
  })

  it('treats a paste as official once the catalog lists it', async () => {
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url !== LIST_URL) return Promise.resolve(fakeResponse(JSON.stringify(clayFile('1.1.0'))))
        return new Promise<Response>(resolve => {
          answer = resolve
        })
      }),
    )
    mount()
    check(CLAY_1)
    fireEvent.click(await screen.findByRole('button', { name: 'Use this theme' }))
    expect(screen.queryByRole('group', { name: 'Updates' })).toBeNull()
    await act(async () => answer(fakeResponse(CLAY_LIST)))
    expect(await screen.findByRole('group', { name: 'Updates' })).toBeTruthy()
  })
})
