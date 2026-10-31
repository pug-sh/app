import { create } from '@bufbuild/protobuf'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { fakeResponse } from '@/test/fake-response'
import { serveByUrl } from '@/test/serve'
import { CLAY_LIST, clayFile, LIST_URL, listOf } from '@/test/theme-repository'

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
const {
  fetchedThemesAtom,
  installedThemesAtom,
  projectOverridesAtom,
  refreshFetchedThemeAtom,
  STORAGE_REFUSED,
  setProjectOverrideAtom,
  themeModeAtom,
  themeSelectionAtom,
} = await import('@/data/theme.atoms')
const { activeProjectAtom } = await import('@/data/workspace.atoms')
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

describe('Settings, Appearance', () => {
  it('sets the mode', () => {
    const store = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(store.get(themeModeAtom)).toBe('dark')
  })

  // Swatches are real buttons, named by their theme, carrying their state, and each
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

  // A pressed swatch used to differ from the rest by one pixel of border colour, the one cue the
  // colourblind and high-contrast themes' own users are least able to see. It carries a mark too.
  it('marks the selected swatch with more than colour', () => {
    mount()
    const row = screen.getByRole('group', { name: 'Light theme' })
    expect(within(row).getByRole('button', { name: 'Pug' }).querySelector('.lucide-check')).not.toBeNull()
    expect(within(row).getByRole('button', { name: 'Pug High Contrast' }).querySelector('.lucide-check')).toBeNull()
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
    expect(trackEvent).toHaveBeenCalledWith('theme_selected', { theme: 'custom', mode: 'dark', scope: 'personal' })
  })

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

  // Reads finish in any order. A slow file landing after a newer pick used to install itself over that
  // pick's report, and the person is left looking at a theme they moved on from.
  it('lets only the latest pick land when an earlier read finishes last', async () => {
    const store = mount()
    let release = () => {}
    const slow = new File([grape], 'slow.json')
    slow.text = () =>
      new Promise(resolve => {
        release = () => resolve(grape)
      })
    fireEvent.change(screen.getByLabelText('Theme file'), { target: { files: [slow] } })
    pick(JSON.stringify({ version: 1, name: 'Muddy', variants: { light: { colors: { foreground: '#bbbbbb' } } } }))
    await screen.findByRole('button', { name: 'Install anyway' })

    await act(async () => release())
    expect(screen.getByRole('button', { name: 'Install anyway' })).toBeTruthy()
    expect(store.get(installedThemesAtom)).toEqual([])
    expect(toast.success).not.toHaveBeenCalled()
  })

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

  // The theme selected for a mode can stop parsing after an upgrade. Pug takes over; the row has to
  // say why, or the page just looks like it lost the choice.
  it('says when the theme selected for a mode can no longer be used', () => {
    const store = createStore()
    const midnight = {
      id: 'installed-midnight' as const,
      text: JSON.stringify({ version: 2, name: 'Midnight', variants: {} }),
      hash: 'midnight',
      installedAt: 0,
      source: 'file' as const,
    }
    store.set(installedThemesAtom, [midnight])
    store.set(themeSelectionAtom, { light: 'pug', dark: midnight.id })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <Provider store={store}>
        <Appearance />
      </Provider>,
    )
    const row = screen.getByRole('group', { name: 'Dark theme' }).parentElement as HTMLElement
    expect(within(row).getByText(/Midnight can’t be used/)).toBeTruthy()
  })

  // An ignored key is not a contrast problem. A file whose only issue is a typo'd key used to be
  // offered with "some colours may be hard to read" and installed as a copy of Pug.
  it('tells ignored keys apart from colours that may be hard to read', async () => {
    mount()
    pick(JSON.stringify({ version: 1, name: 'Typo', variants: { dark: { colours: { background: '#1e1b2e' } } } }))
    expect(await screen.findByText(/were ignored/)).toBeTruthy()
    expect(screen.queryByText(/hard to read/)).toBeNull()
  })

  // The table's check used to be a bare count, or an error behind a tooltip. Either is readable now.
  it("opens an installed theme's warnings in place", async () => {
    mount()
    pick(JSON.stringify({ version: 1, name: 'Muddy', variants: { light: { colors: { foreground: '#bbbbbb' } } } }))
    fireEvent.click(await screen.findByRole('button', { name: 'Install anyway' }))
    const toggle = await screen.findByRole('button', { name: /warnings?$/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(within(screen.getByRole('table')).getByText(/foreground on background is/)).toBeTruthy()
  })
})

describe('This project', () => {
  const inProject = (defaultTheme: string, override?: string) => {
    const store = createStore()
    store.set(activeProjectAtom, create(ProjectSchema, { id: 'p1', displayName: 'Acme', defaultTheme }))
    if (override) store.set(projectOverridesAtom, { p1: override })
    render(
      <Provider store={store}>
        <Appearance />
      </Provider>,
    )
    return store
  }
  const pickSwatch = (name: string) =>
    fireEvent.click(within(screen.getByRole('group', { name: 'Themes' })).getByRole('button', { name }))

  afterEach(() => vi.unstubAllGlobals())

  it('shows the project’s default, and overrides it in this browser', () => {
    const store = inProject('pug-colourblind#dark')
    expect(screen.getByText('Project default: Pug Colourblind-safe, always dark')).toBeTruthy()
    pickSwatch('Pug High Contrast')
    fireEvent.click(screen.getByRole('button', { name: 'Use in this project' }))
    expect(store.get(projectOverridesAtom)).toEqual({ p1: 'pug-high-contrast' })
    expect(screen.getByText('Using Pug High Contrast in this project.')).toBeTruthy()
    expect(trackEvent).toHaveBeenCalledWith('theme_selected', {
      theme: 'pug-high-contrast',
      mode: 'both',
      scope: 'project',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Back to project default' }))
    expect(store.get(projectOverridesAtom)).toEqual({})
  })

  it('says when the project’s theme couldn’t load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse('', { status: 404 })),
    )
    const url = 'https://themes.pug.sh/gone/theme.json'
    const store = inProject(url)
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Couldn’t load this project’s theme. Showing your theme instead.')).toBeTruthy()
  })

  it('notes a pinned mode under Mode', () => {
    inProject('pug#dark')
    expect(screen.getByText('This project is always dark.')).toBeTruthy()
  })

  it('says so when storage refuses the override', () => {
    const store = inProject('')
    pickSwatch('Pug High Contrast')
    const refusal = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Use in this project' }))
    } finally {
      refusal.mockRestore()
    }
    expect(toast.error).toHaveBeenCalledWith(STORAGE_REFUSED)
    expect(store.get(projectOverridesAtom)).toEqual({})
  })

  // A reference from a newer build, or an id set through the API: nothing will load it, so no "Loading".
  it.each(['pug#dim', 'pug-colorblind'])('says a default it can’t use, %j, couldn’t load', defaultTheme => {
    inProject(defaultTheme)
    expect(screen.getByText('Couldn’t load this project’s theme. Showing your theme instead.')).toBeTruthy()
  })

  it('says why the member’s own file for the project isn’t showing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse('', { status: 404 })),
    )
    const url = 'https://themes.pug.sh/mine/theme.json'
    const store = inProject('')
    act(() => {
      store.set(setProjectOverrideAtom, { projectId: 'p1', reference: url })
    })
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Last check failed: the host answered 404.')).toBeTruthy()
  })

  // Linen has no dark variant, so its pin is ignored and the mode is the member's.
  it('describes the mode in effect, not a pin that was ignored', async () => {
    const linen = JSON.stringify({
      version: 1,
      name: 'Linen',
      variants: { light: { colors: { background: '#f3eee4' } } },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(linen)),
    )
    const url = 'https://cdn.example.com/linen/theme.json'
    const store = inProject(`${url}#dark`)
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Project default: Linen, follows each member’s mode')).toBeTruthy()
  })

  it('keeps the member’s own rows under Your theme', () => {
    inProject('')
    expect(screen.getByText('Used in projects without a default')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Light theme' })).toBeTruthy()
  })

  describe('an override on an official theme', () => {
    const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json'
    const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')

    it('keeps its track and mode when its theme is picked again', async () => {
      serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
      const store = inProject('', `${CLAY_1}#dark`)
      await within(screen.getByRole('group', { name: 'Themes' })).findByRole('button', { name: 'Clay' })
      pickSwatch('Clay')
      expect(pressed('Follow 1.x')).toBe('true')
      await waitFor(() => expect(pressed('Always dark')).toBe('true'))
      const use = screen.getByRole('button', { name: 'Use in this project' }) as HTMLButtonElement
      await waitFor(() => expect(use.disabled).toBe(false))
      fireEvent.click(use)
      expect(store.get(projectOverridesAtom)).toEqual({ p1: `${CLAY_1}#dark` })
    })

    it('says what it won’t reach', async () => {
      serveByUrl({ [LIST_URL]: CLAY_LIST })
      inProject('', CLAY_1)
      expect(await screen.findByText('2.0.0 is out. You stay on 1.x until you switch.')).toBeTruthy()
    })
  })

  describe('a theme with no variant for the mode in effect', () => {
    const url = 'https://cdn.example.com/linen/theme.json'
    const linen = JSON.stringify({
      version: 1,
      name: 'Linen',
      variants: { light: { colors: { background: '#f3eee4' } } },
    })
    const reading = async (mode: 'light' | 'dark') => {
      serveByUrl({ [url]: linen })
      const store = inProject(url)
      act(() => {
        store.set(themeModeAtom, mode)
      })
      await act(() => store.set(refreshFetchedThemeAtom, url))
      return screen.queryByText(/has no \w+ variant, so Pug is showing instead/)
    }

    it('says Pug is showing in that mode, or the summary claims a theme that isn’t there', async () => {
      expect((await reading('dark'))?.textContent).toBe('Linen has no dark variant, so Pug is showing instead.')
    })

    it('says nothing in a mode the theme has', async () => {
      expect(await reading('light')).toBeNull()
    })

    it('says nothing while the member’s own theme is the one showing', async () => {
      serveByUrl({ [url]: linen })
      const store = inProject('')
      act(() => {
        store.set(themeModeAtom, 'dark')
        store.set(themeSelectionAtom, { light: 'pug', dark: url })
      })
      await act(() => store.set(refreshFetchedThemeAtom, url))
      const thisProject = screen.getByText(/in this browser/).closest('section') as HTMLElement
      expect(within(thisProject).queryByText(/so Pug is showing instead/)).toBeNull()
    })
  })
})

describe('official themes in your own rows', () => {
  const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json'
  const row = (name: 'Light theme' | 'Dark theme') => screen.getByRole('group', { name })
  const urlForm = (label: string) => screen.getByLabelText(label).closest('form') as HTMLFormElement

  afterEach(() => vi.unstubAllGlobals())

  it('reads an official override in words', async () => {
    serveByUrl({ 'https://themes.pug.sh/clay/theme.json': JSON.stringify(clayFile('2.0.0')) })
    const store = createStore()
    store.set(activeProjectAtom, create(ProjectSchema, { id: 'p1', displayName: 'P' }))
    store.set(projectOverridesAtom, { p1: 'https://themes.pug.sh/clay/theme.json' })
    render(
      <Provider store={store}>
        <Appearance />
      </Provider>,
    )
    await act(() => store.set(refreshFetchedThemeAtom, 'https://themes.pug.sh/clay/theme.json'))
    expect(screen.getByText('Using Clay, latest (now 2.0.0) in this project.')).toBeTruthy()
  })

  it('shows an installed theme’s release beside its author', () => {
    const clay = JSON.stringify({
      version: 1,
      name: 'Clay',
      metadata: { author: 'Pug', release: '1.0.0' },
      variants: { light: { colors: { background: '#f3eee4' } } },
    })
    const store = createStore()
    store.set(installedThemesAtom, [{ id: 'installed-clay', text: clay, hash: 'clay', installedAt: 0, source: 'file' }])
    render(
      <Provider store={store}>
        <Appearance />
      </Provider>,
    )
    const cell = screen.getByRole('cell', { name: /Clay/ })
    expect(cell.textContent).toBe('Clay 1.0.0 · Pug')
  })

  it('lists them in the rows that have their mode', async () => {
    const paper = { version: 1, name: 'Paper', variants: { light: { colors: { background: '#ffffff' } } } }
    serveByUrl({
      [LIST_URL]: listOf(
        { slug: 'clay', releases: ['1.0.0'], latest: clayFile('1.0.0') },
        { slug: 'paper', releases: ['1.0.0'], latest: paper },
      ),
    })
    mount()
    expect(await within(row('Light theme')).findByRole('button', { name: 'Paper' })).toBeTruthy()
    expect(within(row('Dark theme')).getByRole('button', { name: 'Clay' })).toBeTruthy()
    expect(within(row('Dark theme')).queryByRole('button', { name: 'Paper' })).toBeNull()
  })

  it('follows the newest major line when picked, and says so', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = mount()
    fireEvent.click(await within(row('Light theme')).findByRole('button', { name: 'Clay' }))
    expect(store.get(themeSelectionAtom).light).toBe('https://themes.pug.sh/clay/2/theme.json')
    expect(trackEvent).toHaveBeenLastCalledWith('theme_selected', {
      theme: 'clay',
      track: 'major',
      mode: 'light',
      scope: 'personal',
    })
    expect(screen.getByRole('button', { name: 'Follow 2.x' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('changes how the row follows Clay, saving at once', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: 'pug' })
    })
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
    expect(await screen.findByText('2.0.0 is out. You stay on 1.x until you switch.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    expect(store.get(themeSelectionAtom).light).toBe('https://themes.pug.sh/clay/theme.json')
  })

  // A swatch's id is its URL, which changes when it's picked. Keyed on that, the focused button was replaced
  // and the next Tab started from the top of the page.
  it('keeps keyboard focus on an official swatch when it’s picked', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    mount()
    const clay = await within(row('Light theme')).findByRole('button', { name: 'Clay' })
    clay.focus()
    fireEvent.click(clay)
    expect(document.activeElement).toBe(clay)
  })

  it('leaves the track alone when the followed swatch is clicked again', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: 'pug' })
    })
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
    fireEvent.click(await within(row('Light theme')).findByRole('button', { name: 'Clay' }))
    expect(store.get(themeSelectionAtom).light).toBe(CLAY_1)
  })

  it('describes the file the row follows, not the catalog’s latest', async () => {
    const file = clayFile('1.1.0')
    const older = { ...file, metadata: { ...file.metadata, description: 'The older, paler Clay.' } }
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(older) })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: 'pug' })
    })
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
    expect(await screen.findByText('The older, paler Clay.')).toBeTruthy()
  })

  it('names each row’s Updates, or a screen reader hears two the same', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: CLAY_1 })
    })
    expect(await screen.findByRole('group', { name: 'Light theme updates' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Dark theme updates' })).toBeTruthy()
  })

  it('says when the theme list can’t be loaded', async () => {
    mount()
    expect(await screen.findByText('Couldn’t load the theme list.')).toBeTruthy()
  })

  it('says why the row shows Pug while its file loads or fails', async () => {
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
    const store = mount()
    await within(row('Light theme')).findByRole('button', { name: 'Clay' })
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: 'pug' })
      void store.set(refreshFetchedThemeAtom, CLAY_1)
    })
    expect(screen.getByText('Checking the file…')).toBeTruthy()
    expect(screen.queryByText(/so Pug is showing instead/)).toBeNull()
    await act(async () => answer(fakeResponse('', { status: 404 })))
    expect(await screen.findByText('Last check failed: the host answered 404.')).toBeTruthy()
    expect(screen.getByText('Clay hasn’t loaded, so Pug is showing instead.')).toBeTruthy()
  })

  it('names the host of a file that hasn’t loaded and the catalog doesn’t list', async () => {
    serveByUrl({})
    const url = 'https://example.com/gone.json'
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: url, dark: 'pug' })
    })
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(await screen.findByText('example.com hasn’t loaded, so Pug is showing instead.')).toBeTruthy()
  })

  // The same failure line used to cover both: this copy still paints, and the file that never arrived doesn't.
  it('says nothing about Pug while a cached copy still paints', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: 'pug' })
    })
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
    expect(await screen.findByText('Last check failed: the host answered 404.')).toBeTruthy()
    expect(screen.queryByText(/so Pug is showing instead/)).toBeNull()
  })

  it('tries a failed file again on request', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: 'pug' })
    })
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(Object.keys(store.get(fetchedThemesAtom))).toEqual([CLAY_1]))
    expect(screen.queryByText(/so Pug is showing instead/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('keeps Updates when neither the file nor the catalog has this mode', async () => {
    const LATEST = 'https://themes.pug.sh/clay/theme.json'
    const lightOnly = { ...clayFile('2.0.0'), variants: { light: clayFile('2.0.0').variants.light } }
    serveByUrl({
      [LIST_URL]: listOf({ slug: 'clay', releases: ['2.0.0', '1.1.0'], latest: lightOnly }),
      [LATEST]: JSON.stringify(lightOnly),
    })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: 'pug', dark: LATEST })
    })
    await act(() => store.set(refreshFetchedThemeAtom, LATEST))
    expect(await screen.findByText('Clay 2.0.0 has no dark variant, so Pug is showing instead.')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Follow 2.x' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '1.x, now 1.1.0' }))
    expect(store.get(themeSelectionAtom).dark).toBe(CLAY_1)
  })

  // A row is the mode, so a pin on a pasted URL has nothing to say here, and a stored one would match nothing.
  it('leaves a pasted pin out of a row', async () => {
    serveByUrl({ 'https://example.com/clay.json': JSON.stringify(clayFile('1.0.0')) })
    const store = mount()
    fireEvent.change(screen.getByLabelText('Light theme URL'), { target: { value: 'example.com/clay.json#dark' } })
    fireEvent.click(within(urlForm('Light theme URL')).getByRole('button', { name: 'Check' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use this theme' }))
    expect(store.get(themeSelectionAtom).light).toBe('https://example.com/clay.json')
  })

  it('says why a followed release without this mode shows Pug, and lets the row move on', async () => {
    const url = 'https://themes.pug.sh/clay/1.0.0/theme.json'
    const { light } = clayFile('1.0.0').variants
    serveByUrl({ [LIST_URL]: CLAY_LIST, [url]: JSON.stringify({ ...clayFile('1.0.0'), variants: { light } }) })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: 'pug', dark: url })
    })
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(await screen.findByText('Clay 1.0.0 has no dark variant, so Pug is showing instead.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    expect(store.get(themeSelectionAtom).dark).toBe('https://themes.pug.sh/clay/theme.json')
  })

  it('says why a file that lost this mode shows Pug', async () => {
    const url = 'https://example.com/paper.json'
    const paper = { version: 1, name: 'Paper', variants: { light: { colors: { background: '#ffffff' } } } }
    serveByUrl({ [LIST_URL]: CLAY_LIST, [url]: JSON.stringify(paper) })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: 'pug', dark: url })
    })
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Paper has no dark variant, so Pug is showing instead.')).toBeTruthy()
  })

  it('uses a theme from a URL for one mode, and refuses one without that mode', async () => {
    const paper = JSON.stringify({
      version: 1,
      name: 'Paper',
      variants: { light: { colors: { background: '#ffffff' } } },
    })
    serveByUrl({ 'https://example.com/paper.json': paper })
    const store = mount()
    fireEvent.change(screen.getByLabelText('Dark theme URL'), { target: { value: 'example.com/paper.json' } })
    fireEvent.click(within(urlForm('Dark theme URL')).getByRole('button', { name: 'Check' }))
    expect(await screen.findByText('Paper has no dark variant.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use this theme' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Light theme URL'), { target: { value: 'example.com/paper.json' } })
    fireEvent.click(within(urlForm('Light theme URL')).getByRole('button', { name: 'Check' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use this theme' }))
    expect(store.get(themeSelectionAtom).light).toBe('https://example.com/paper.json')
  })
})
