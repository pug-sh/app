import { create } from '@bufbuild/protobuf'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { fakeResponse } from '@/test/fake-response'
import { serveByUrl } from '@/test/serve'
import { applyTheme, findTile, MOSS, openTheme, panel, themeList, tile } from '@/test/theme-gallery'
import { CLAY_LIST, clayFile, LIST_URL, listOf } from '@/test/theme-repository'
import type { InstalledTheme, RemoteId } from '@/theme/library'

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
  accessModeAtom,
  fetchedThemesAtom,
  installedThemesAtom,
  projectOverridesAtom,
  refreshFetchedThemeAtom,
  STORAGE_REFUSED,
  setProjectOverrideAtom,
  themeChoiceAtom,
  themeContrastAtom,
  themeModeAtom,
  themeSelectionAtom,
} = await import('@/data/theme.atoms')
const { activeProjectAtom } = await import('@/data/workspace.atoms')
const Appearance = (await import('./index.page')).default

const grape = JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } })
const muddy = JSON.stringify({
  version: 1,
  name: 'Muddy',
  variants: { light: { colors: { foreground: '#bbbbbb' } } },
})

const FERN: InstalledTheme = { ...MOSS, id: 'installed-fern', text: MOSS.text.replace('Moss', 'Fern'), hash: 'fern' }

const mount = (themes: InstalledTheme[] = []) => {
  const store = createStore()
  if (themes.length > 0) store.set(installedThemesAtom, themes)
  render(
    <Provider store={store}>
      <Appearance />
    </Provider>,
  )
  return store
}
const mountWithMoss = () => mount([MOSS])

const card = () => screen.getByRole('figure')
const addTheme = () => {
  if (!screen.queryByLabelText('Theme URL')) fireEvent.click(screen.getByRole('button', { name: 'Add a theme' }))
}
const pick = (text: string, name = 'theme.json') => {
  addTheme()
  fireEvent.change(screen.getByLabelText('Theme file'), { target: { files: [new File([text], name)] } })
}
const check = (url: string) => {
  addTheme()
  fireEvent.change(screen.getByLabelText('Theme URL'), { target: { value: url } })
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
}
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')
const splitModes = () => fireEvent.click(screen.getByRole('button', { name: 'Use a different theme for dark' }))
const mountIn = (mode: 'light' | 'dark', selection: { light: string; dark: string }, themes: InstalledTheme[] = []) => {
  const store = createStore()
  if (themes.length > 0) store.set(installedThemesAtom, themes)
  store.set(themeModeAtom, mode)
  store.set(themeSelectionAtom, selection)
  render(
    <Provider store={store}>
      <Appearance />
    </Provider>,
  )
  return store
}
const installed = () => screen.findByRole('group', { name: 'Installed' })

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

  it('starts on Match system and Standard', () => {
    mount()
    const contrast = screen.getByRole('group', { name: 'Contrast' })
    const vision = screen.getByRole('group', { name: 'Colour vision' })
    expect(within(contrast).getByRole('button', { name: 'Match system' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(vision).getByRole('button', { name: 'Standard' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('sets the contrast, and the page follows', () => {
    const store = mount()
    const group = screen.getByRole('group', { name: 'Contrast' })
    fireEvent.click(within(group).getByRole('button', { name: 'High' }))
    expect(store.get(accessModeAtom).contrast).toBe('high')
    expect(within(group).getByRole('button', { name: 'High' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('sets colour vision, and the page follows', () => {
    const store = mount()
    const group = screen.getByRole('group', { name: 'Colour vision' })
    fireEvent.click(within(group).getByRole('button', { name: 'Colourblind-safe' }))
    expect(store.get(accessModeAtom).vision).toBe('colourblind')
  })

  it('says when the browser refused a setting', () => {
    const store = mount()
    const refusal = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'High' }))
    } finally {
      refusal.mockRestore()
    }
    expect(toast.error).toHaveBeenCalledWith(STORAGE_REFUSED)
    expect(store.get(accessModeAtom).contrast).toBe('standard')
  })

  // Tiles are real buttons, named by their theme, carrying their state, and each group is labelled,
  // or a screen reader can't say what a tile belongs to: two groups can hold one name.
  it('offers each theme as a pressable button inside a labelled group', () => {
    mountWithMoss()
    const builtIn = screen.getByRole('group', { name: 'Built in' })
    const yours = screen.getByRole('group', { name: 'Installed' })
    expect(within(builtIn).getByRole('button', { name: 'Pug' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(yours).getByRole('button', { name: 'Moss' }).getAttribute('aria-pressed')).toBe('false')
  })

  // A pressed swatch used to differ from the rest by one pixel of border colour, the one cue the
  // colourblind and high-contrast themes' own users are least able to see. It carries a mark too.
  it('marks the selected tile with more than colour', () => {
    mountWithMoss()
    expect(tile('Pug').querySelector('.lucide-check')).not.toBeNull()
    expect(tile('Moss').querySelector('.lucide-check')).toBeNull()
  })

  it('installs a clean file, lists it, and applies it from its tile', async () => {
    const store = mount()
    pick(grape)
    expect(within(await installed()).getByRole('button', { name: 'Grape, Dark only' })).toBeTruthy()
    expect(toast.success).toHaveBeenCalledWith('Installed Grape')

    await applyTheme('Grape, Dark only')
    const id = store.get(installedThemesAtom)[0].id
    expect(store.get(themeSelectionAtom)).toEqual({ light: id, dark: id })
    expect(trackEvent).toHaveBeenCalledWith('theme_selected', { theme: 'custom', mode: 'both', scope: 'personal' })
  })

  it('refuses a file that is not a theme', async () => {
    mount()
    pick('\u0089PNG\r\n', 'logo.png')
    expect(await screen.findByText('Not valid JSON')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Installed' })).toBeNull()
  })

  it('refuses a duplicate', async () => {
    mount()
    pick(grape)
    await installed()
    pick(grape)
    expect(await screen.findByText('Already installed.')).toBeTruthy()
  })

  it('asks before installing a theme with warnings', async () => {
    const store = mount()
    pick(muddy)
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
    addTheme()
    fireEvent.change(screen.getByLabelText('Theme file'), { target: { files: [slow] } })
    pick(muddy)
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
    expect(within(await installed()).getByText(name)).toBeTruthy()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('removes a theme on the second click and falls its mode back to Pug', async () => {
    const store = mount()
    pick(grape)
    await installed()
    await applyTheme('Grape, Dark only')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Remove theme' }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Confirm remove' }))
    expect(store.get(installedThemesAtom)).toEqual([])
    expect(store.get(themeSelectionAtom).dark).toBe('pug')
  })

  // A full quota or a blocked profile: the choice can't be kept, and saying nothing would leave the
  // page looking as if the click did nothing at all.
  it('says so when the browser refuses to save a choice, and keeps the old one', async () => {
    mountWithMoss()
    await openTheme('Moss')
    const refusal = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Use this theme' }))
      expect(toast.error).toHaveBeenCalledWith(STORAGE_REFUSED)
      expect(tile('Pug').getAttribute('aria-pressed')).toBe('true')

      fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
      expect(toast.error).toHaveBeenCalledTimes(2)
    } finally {
      refusal.mockRestore()
    }
  })

  // The theme selected for a mode can stop parsing after an upgrade. Pug takes over; the strip has to
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
    store.set(themeModeAtom, 'dark')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <Provider store={store}>
        <Appearance />
      </Provider>,
    )
    expect(screen.getByText(/Midnight can’t be used/)).toBeTruthy()
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
    pick(muddy)
    fireEvent.click(await screen.findByRole('button', { name: 'Install anyway' }))
    const toggle = await findTile('Muddy, Light only')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(within(panel()).getByText(/foreground on background is/)).toBeTruthy()
  })
})

describe('In use', () => {
  const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json'
  const differing = () => {
    const store = createStore()
    store.set(installedThemesAtom, [MOSS])
    store.set(themeSelectionAtom, { light: 'pug', dark: MOSS.id })
    const view = render(
      <Provider store={store}>
        <Appearance />
      </Provider>,
    )
    return { store, view }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('applies a theme to both modes while there’s one choice', async () => {
    const store = mountWithMoss()
    await applyTheme('Moss')
    expect(store.get(themeSelectionAtom)).toEqual({ light: MOSS.id, dark: MOSS.id })
    expect(trackEvent).toHaveBeenLastCalledWith('theme_selected', {
      theme: 'custom',
      mode: 'both',
      scope: 'personal',
    })
  })

  it('draws what’s in use in the member’s mode', () => {
    const store = mount()
    act(() => {
      store.set(themeContrastAtom, 'high')
    })
    expect(card().querySelector('rect')?.getAttribute('fill')).toBe('oklch(1 0 0)')
  })

  it('splits the modes on request, starting dark as the light choice', () => {
    mount()
    expect(screen.queryByText(/^In dark/)).toBeNull()
    splitModes()
    expect(card().textContent).toBe('Your theme in lightPug')
    expect(screen.getByText('In dark: Pug.')).toBeTruthy()
  })

  it('lands on the split view when the two choices differ, with nothing changed', () => {
    const { store } = differing()
    expect(card().textContent).toBe('Your theme in lightPug')
    expect(screen.getByText('In dark: Moss.')).toBeTruthy()
    expect(store.get(themeSelectionAtom)).toEqual({ light: 'pug', dark: MOSS.id })
  })

  it('shows the dark choice while dark is on screen', () => {
    mountIn('dark', { light: 'pug', dark: MOSS.id }, [MOSS])
    expect(card().textContent).toBe('Your theme in darkMoss')
    expect(screen.getByText('In light: Pug.')).toBeTruthy()
  })

  it('writes one mode from each button once they’re split', async () => {
    const store = mount([MOSS, FERN])
    splitModes()
    await applyTheme('Moss', 'Use for dark')
    await applyTheme('Fern', 'Use for light')
    expect(store.get(themeSelectionAtom)).toEqual({ light: FERN.id, dark: MOSS.id })
  })

  it('says where a mode you aren’t in went, on the button and under it', async () => {
    mount([MOSS])
    splitModes()
    await applyTheme('Moss', 'Use for dark')
    expect(within(panel()).getByRole('button', { name: 'Your dark theme' })).toBeTruthy()
    expect(within(panel()).getByText('You’ll see it in dark mode.')).toBeTruthy()
  })

  it('keeps the split when both modes come to hold one theme, until the page reloads', async () => {
    const { store, view } = differing()
    await applyTheme('Pug', 'Use for dark')
    expect(store.get(themeSelectionAtom)).toEqual({ light: 'pug', dark: 'pug' })
    expect(screen.getByText('In dark: Pug.')).toBeTruthy()
    view.unmount()
    render(
      <Provider store={store}>
        <Appearance />
      </Provider>,
    )
    expect(screen.queryByText(/^In dark/)).toBeNull()
    expect(card().textContent).toBe('Your themePug')
  })

  it('keeps the theme on screen for one theme for both', () => {
    const { store } = differing()
    fireEvent.click(screen.getByRole('button', { name: 'Use one theme for both' }))
    expect(store.get(themeSelectionAtom)).toEqual({ light: 'pug', dark: 'pug' })
    expect(screen.queryByText(/^In dark/)).toBeNull()
  })

  it('keeps the dark choice for one theme for both while dark is on screen', () => {
    const store = mountIn('dark', { light: 'pug', dark: MOSS.id }, [MOSS])
    fireEvent.click(screen.getByRole('button', { name: 'Use one theme for both' }))
    expect(store.get(themeSelectionAtom)).toEqual({ light: MOSS.id, dark: MOSS.id })
  })

  it('leaves the split as it was when storage refuses one theme for both', () => {
    differing()
    const refusal = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Use one theme for both' }))
    } finally {
      refusal.mockRestore()
    }
    expect(toast.error).toHaveBeenCalledWith(STORAGE_REFUSED)
    expect(screen.getByText('In dark: Moss.')).toBeTruthy()
  })

  it('keeps every theme once split, offering only the modes each has', async () => {
    const paper = { version: 1, name: 'Paper', variants: { light: { colors: { background: '#ffffff' } } } }
    serveByUrl({ [LIST_URL]: listOf({ slug: 'paper', releases: ['1.0.0'], latest: paper }) })
    mount()
    splitModes()
    await openTheme('Paper, Light only')
    expect(within(panel()).getByRole('button', { name: 'Use for light' })).toBeTruthy()
    expect(within(panel()).queryByRole('button', { name: 'Use for dark' })).toBeNull()
  })

  // Pug is what paints in dark here, and the panel is where the click was made.
  it('says under the button when a theme has no version for the mode on screen', async () => {
    mountIn('dark', { light: 'pug', dark: 'pug' })
    pick(muddy)
    fireEvent.click(await screen.findByRole('button', { name: 'Install anyway' }))
    await applyTheme('Muddy, Light only')
    expect(within(panel()).getByText('Muddy has no dark version, so Pug is showing instead.')).toBeTruthy()
  })

  it('reads In use on what’s on screen', async () => {
    mount()
    await openTheme('Pug')
    expect(within(panel()).getByRole('button', { name: 'In use' })).toBeTruthy()
  })

  it('reads a saved file as a plain URL with no default repository', async () => {
    vi.stubEnv('VITE_AIR_GAP', 'true')
    serveByUrl({ [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: CLAY_1 })
    })
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
    expect(card().textContent).toContain('Clay (themes.pug.sh)')
    expect(screen.queryByRole('group', { name: /updates/i })).toBeNull()
  })

  // Review Focus 2.
  it.each([
    ['a file from any other URL', 'https://example.com/paper.json', 'Elsewhere (example.com)'],
    ['a followed theme the catalog doesn’t list', CLAY_1, 'Clay, following 1.x (now 1.1.0)'],
  ])('names a theme with no tile by name and host: %s', async (_, url, name) => {
    const file = url === CLAY_1 ? clayFile('1.1.0') : { ...clayFile('1.0.0'), name: 'Elsewhere' }
    serveByUrl({ [url]: JSON.stringify(file) })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: url, dark: url })
    })
    await act(() => store.set(refreshFetchedThemeAtom, url as RemoteId))
    expect(card().textContent).toContain(name)
    expect(within(themeList()).queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })
})

describe('This project', () => {
  const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json'
  const CLAY_2 = 'https://themes.pug.sh/clay/2/theme.json'
  const CLAY_ONE = 'https://themes.pug.sh/clay/1.0.0/theme.json'
  const LIGHT_ONLY = JSON.stringify({ ...clayFile('1.0.0'), variants: { light: clayFile('1.0.0').variants.light } })
  const url = 'https://cdn.example.com/linen/theme.json'
  const linen = JSON.stringify({
    version: 1,
    name: 'Linen',
    variants: { light: { colors: { background: '#f3eee4' } } },
  })

  const inProject = (defaultTheme: string, override?: string, themes: InstalledTheme[] = []) => {
    const store = createStore()
    if (themes.length > 0) store.set(installedThemesAtom, themes)
    store.set(activeProjectAtom, create(ProjectSchema, { id: 'p1', displayName: 'Acme', defaultTheme }))
    if (override) store.set(projectOverridesAtom, { p1: override })
    render(
      <Provider store={store}>
        <Appearance />
      </Provider>,
    )
    return store
  }
  const onlyRelease = async (release: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Only one release' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: release }))
  }
  // A fetch that answers the catalog and leaves every other URL waiting on what it returns. Refreshes of one URL
  // share a fetch, so one left hanging past its test would hold up the next test's.
  const deferred = () => {
    const answer = { current: (_: Response) => {}, to: new Map<string, (response: Response) => void>() }
    onTestFinished(() => {
      for (const resolve of answer.to.values()) resolve(fakeResponse('', { status: 404 }))
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((address: string) => {
        if (address === LIST_URL) return Promise.resolve(fakeResponse(CLAY_LIST))
        return new Promise<Response>(resolve => {
          answer.current = resolve
          answer.to.set(address, resolve)
        })
      }),
    )
    return answer
  }

  afterEach(() => vi.unstubAllGlobals())

  it('shows the project’s default, and overrides it in this browser', async () => {
    const store = inProject('pug#dark', undefined, [MOSS])
    expect(screen.getByText('Project default: Pug, always dark')).toBeTruthy()
    await applyTheme('Moss', 'Use in this project')
    expect(store.get(projectOverridesAtom)).toEqual({ p1: MOSS.id })
    expect(screen.getByText('Using Moss in this project.')).toBeTruthy()
    expect(trackEvent).toHaveBeenCalledWith('theme_selected', {
      theme: 'custom',
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
    const address = 'https://themes.pug.sh/gone/theme.json'
    const store = inProject(address)
    await act(() => store.set(refreshFetchedThemeAtom, address))
    expect(screen.getByText('Couldn’t load this project’s theme. Showing your theme instead.')).toBeTruthy()
  })

  it('notes a pinned mode under Mode', () => {
    inProject('pug#dark')
    expect(screen.getByText('This project is always dark.')).toBeTruthy()
  })

  it('says so when storage refuses the override', async () => {
    const store = inProject('', undefined, [MOSS])
    await openTheme('Moss')
    const refusal = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Only in this project' }))
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
    const address = 'https://themes.pug.sh/mine/theme.json'
    const store = inProject('')
    act(() => {
      store.set(setProjectOverrideAtom, { projectId: 'p1', reference: address })
    })
    await act(() => store.set(refreshFetchedThemeAtom, address))
    expect(screen.getByText('Last check failed: the host answered 404.')).toBeTruthy()
    expect(screen.getByText('mine, latest hasn’t loaded, so your theme is showing instead.')).toBeTruthy()
  })

  it('tries a project’s failed file again on request', async () => {
    serveByUrl({})
    const store = inProject('', CLAY_1)
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
    serveByUrl({ [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(Object.keys(store.get(fetchedThemesAtom))).toEqual([CLAY_1]))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  // Linen has no dark variant, so its pin is ignored and the mode is the member's.
  it('describes the mode in effect, not a pin that was ignored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(linen)),
    )
    const store = inProject(`${url}#dark`)
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Project default: Linen, follows each member’s mode')).toBeTruthy()
  })

  it('keeps the caption under Your theme', () => {
    inProject('')
    expect(screen.getByText('Used in projects without a default')).toBeTruthy()
  })

  // Review Focus 1: an override is a saved choice like any other, and it reads as Pug in the member's own settings.
  it('reads an override saved before the modes as Pug', () => {
    inProject('', 'pug-high-contrast')
    expect(card().textContent).toBe('This projectPug')
    expect(screen.getByText('Using Pug in this project.')).toBeTruthy()
    expect(screen.queryByText(/can’t be used/)).toBeNull()
  })

  // The default sits over your own theme, so applying a theme there as yours would change nothing on screen.
  it('applies a theme to the project when it has its own, and it shows', async () => {
    const store = inProject('pug#dark', undefined, [MOSS])
    expect(card().textContent).toBe('This projectDefault: Pug')
    await applyTheme('Moss', 'Use in this project')
    expect(store.get(themeChoiceAtom)).toMatchObject({ source: 'override', selection: { light: MOSS.id } })
    expect(within(panel()).getByRole('button', { name: 'In use' })).toBeTruthy()
  })

  // Its default can't paint, but the override applied over it can.
  it('applies to the project when its own theme can’t paint, and it shows', async () => {
    const store = inProject('pug-colorblind', undefined, [MOSS])
    await applyTheme('Moss', 'Use in this project')
    expect(store.get(themeChoiceAtom).source).toBe('override')
  })

  it('makes a theme yours from a project with its own, and says why it doesn’t show here', async () => {
    const store = inProject('pug#dark', undefined, [MOSS])
    await applyTheme('Moss', 'Make it my theme')
    expect(store.get(themeSelectionAtom)).toEqual({ light: MOSS.id, dark: MOSS.id })
    expect(store.get(themeChoiceAtom).source).toBe('project')
    expect(within(panel()).getByRole('button', { name: 'Your theme' })).toBeTruthy()
    expect(
      within(panel()).getByText('This project uses its own theme. Yours shows in projects without one.'),
    ).toBeTruthy()
    expect(screen.getByText('Your theme, Moss, shows in projects without one of their own.')).toBeTruthy()
  })

  it('applies a theme to this project alone when it has none, keeping the focus', async () => {
    const store = inProject('', undefined, [MOSS])
    await openTheme('Moss')
    const only = within(panel()).getByRole('button', { name: 'Only in this project' })
    only.focus()
    fireEvent.click(only)
    expect(store.get(projectOverridesAtom)).toEqual({ p1: MOSS.id })
    expect(store.get(themeChoiceAtom).source).toBe('override')
    expect(document.activeElement).toBe(only)
    expect(only.textContent).toBe('In use')
  })

  it('marks a default’s tile as in use, and writes nothing from it', async () => {
    const store = inProject(MOSS.id, undefined, [MOSS])
    await openTheme('Moss')
    expect(tile('Moss').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(panel()).getByRole('button', { name: 'In use' }))
    expect(store.get(projectOverridesAtom)).toEqual({})
  })

  it('says where your own theme shows while the project’s is on screen', () => {
    inProject(MOSS.id, undefined, [MOSS])
    expect(screen.getByText('Your theme, Pug, shows in projects without one of their own.')).toBeTruthy()
  })

  it('pins a single-variant installed theme to its only mode', async () => {
    const store = inProject('', 'pug')
    pick(grape)
    await installed()
    await applyTheme('Grape, Dark only', 'Use in this project')
    expect(screen.getByText('Grape has only a dark variant.')).toBeTruthy()
    expect(store.get(projectOverridesAtom)).toEqual({ p1: `${store.get(installedThemesAtom)[0].id}#dark` })
  })

  it('applies a repository theme straight away, with no read', async () => {
    const fetcher = serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = inProject('', 'pug')
    await applyTheme('Clay', 'Use in this project')
    expect(store.get(projectOverridesAtom)).toEqual({ p1: CLAY_2 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('changes the mode at once from the strip', () => {
    const store = inProject('', 'pug')
    fireEvent.click(screen.getByRole('button', { name: 'Always dark' }))
    expect(store.get(projectOverridesAtom)).toEqual({ p1: 'pug#dark' })
  })

  it('applies a pasted link, keeping its pin', async () => {
    serveByUrl({ 'https://example.com/clay.json': JSON.stringify(clayFile('1.0.0')) })
    const store = inProject('', 'pug')
    check('example.com/clay.json#dark')
    fireEvent.click(await screen.findByRole('button', { name: 'Use in this project' }))
    expect(store.get(projectOverridesAtom)).toEqual({ p1: 'https://example.com/clay.json#dark' })
  })

  it('leaves the saved reference as it was when a release can’t be read, and says why', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = inProject('', CLAY_2)
    await screen.findByRole('group', { name: 'This project updates' })
    await onlyRelease('1.0.0')
    expect(await screen.findByText('Last check failed: the host answered 404.')).toBeTruthy()
    expect(store.get(projectOverridesAtom)).toEqual({ p1: CLAY_2 })
  })

  it('reads a release the catalog doesn’t carry first, and says so', async () => {
    const answer = deferred()
    const store = inProject('', CLAY_2)
    await screen.findByRole('group', { name: 'This project updates' })
    await onlyRelease('1.0.0')
    expect(screen.getByText('Checking the file…')).toBeTruthy()
    expect(store.get(projectOverridesAtom)).toEqual({ p1: CLAY_2 })
    await act(async () => answer.current(fakeResponse(LIGHT_ONLY)))
    await waitFor(() => expect(store.get(projectOverridesAtom)).toEqual({ p1: `${CLAY_ONE}#light` }))
  })

  // Review Focus 4.
  it('lets only the latest track land when an earlier read finishes last', async () => {
    const answer = deferred()
    const store = inProject('', CLAY_2)
    await screen.findByRole('group', { name: 'This project updates' })
    await onlyRelease('1.0.0')
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    await act(async () => answer.current(fakeResponse(LIGHT_ONLY)))
    expect(store.get(projectOverridesAtom)).toEqual({ p1: 'https://themes.pug.sh/clay/theme.json' })
  })

  // The earlier read would land first and move the override, and the later one would give way to it.
  it('lets the latest track land when an earlier read finishes first', async () => {
    const CLAY_ELEVEN = 'https://themes.pug.sh/clay/1.1.0/theme.json'
    const answer = deferred()
    const store = inProject('', CLAY_2)
    await screen.findByRole('group', { name: 'This project updates' })
    await onlyRelease('1.0.0')
    await onlyRelease('1.1.0')
    await act(async () => answer.to.get(CLAY_ONE)?.(fakeResponse(LIGHT_ONLY)))
    expect(store.get(projectOverridesAtom)).toEqual({ p1: CLAY_2 })
    await act(async () => answer.to.get(CLAY_ELEVEN)?.(fakeResponse(JSON.stringify(clayFile('1.1.0')))))
    await waitFor(() => expect(store.get(projectOverridesAtom)).toEqual({ p1: CLAY_ELEVEN }))
  })

  // A read can take ten seconds, and the override can move under it from the list or the strip.
  describe('a write made while a release is being read', () => {
    const reading = async () => {
      const answer = deferred()
      const store = inProject('', CLAY_2, [MOSS])
      await screen.findByRole('group', { name: 'This project updates' })
      await onlyRelease('1.0.0')
      return { answer, store }
    }

    it('keeps a theme applied from the list', async () => {
      const { answer, store } = await reading()
      await applyTheme('Moss', 'Use in this project')
      await act(async () => answer.current(fakeResponse(LIGHT_ONLY)))
      expect(store.get(projectOverridesAtom)).toEqual({ p1: MOSS.id })
    })

    it('keeps a mode changed from the strip', async () => {
      const { answer, store } = await reading()
      fireEvent.click(screen.getByRole('button', { name: 'Always dark' }))
      await act(async () => answer.current(fakeResponse(LIGHT_ONLY)))
      expect(store.get(projectOverridesAtom)).toEqual({ p1: `${CLAY_2}#dark` })
    })

    it('keeps the way back', async () => {
      const { answer, store } = await reading()
      fireEvent.click(screen.getByRole('button', { name: 'Back to your theme' }))
      await act(async () => answer.current(fakeResponse(LIGHT_ONLY)))
      expect(store.get(projectOverridesAtom)).toEqual({})
    })

    it('stops talking about the file once the theme has moved on', async () => {
      await reading()
      expect(screen.getByText('Checking the file…')).toBeTruthy()
      await applyTheme('Moss', 'Use in this project')
      expect(screen.queryByText('Checking the file…')).toBeNull()
    })
  })

  // Review Focus 3. Applied as yours while the default loads, a theme would vanish under it once it lands.
  it('applies to the project while its default is still loading', async () => {
    serveByUrl({ [url]: linen })
    const store = inProject(url, undefined, [MOSS])
    expect(store.get(themeChoiceAtom).source).toBe('personal')
    await applyTheme('Moss', 'Use in this project')
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(store.get(themeChoiceAtom)).toMatchObject({ source: 'override', selection: { light: MOSS.id } })
  })

  describe('an override on an official theme', () => {
    it('keeps its track and mode when its theme is opened', async () => {
      serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
      const store = inProject('', `${CLAY_1}#dark`)
      await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
      await openTheme('Clay')
      expect(pressed('Follow 1.x')).toBe('true')
      await waitFor(() => expect(pressed('Always dark')).toBe('true'))
      fireEvent.click(within(panel()).getByRole('button', { name: 'In use' }))
      expect(store.get(projectOverridesAtom)).toEqual({ p1: `${CLAY_1}#dark` })
    })

    it('says what it won’t reach', async () => {
      serveByUrl({ [LIST_URL]: CLAY_LIST })
      inProject('', CLAY_1)
      expect(await screen.findByText('2.0.0 is out. You stay on 1.x until you switch.')).toBeTruthy()
    })
  })

  describe('a theme with no variant for the mode in effect', () => {
    const reading = async (mode: 'light' | 'dark') => {
      serveByUrl({ [url]: linen })
      const store = inProject(url)
      act(() => {
        store.set(themeModeAtom, mode)
      })
      await act(() => store.set(refreshFetchedThemeAtom, url))
      return screen.queryByText(/has no \w+ version, so Pug is showing instead/)
    }

    it('says Pug is showing in that mode, or the summary claims a theme that isn’t there', async () => {
      expect((await reading('dark'))?.textContent).toBe('Linen has no dark version, so Pug is showing instead.')
    })

    it('says nothing in a mode the theme has', async () => {
      expect(await reading('light')).toBeNull()
    })
  })
})

describe('official themes in your own rows', () => {
  const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json'

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('stays quiet in an air-gapped build', async () => {
    vi.stubEnv('VITE_AIR_GAP', 'true')
    const fetcher = serveByUrl({ [LIST_URL]: CLAY_LIST })
    mount()
    await screen.findAllByRole('button', { name: 'Pug' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.queryByText(/Couldn’t reach/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clay' })).toBeNull()
  })

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

  it('shows an installed theme’s release beside its author', async () => {
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
    await openTheme('Clay, Light only')
    expect(within(panel()).getByText('Clay 1.0.0')).toBeTruthy()
    expect(within(panel()).getByText('· by Pug · Installed')).toBeTruthy()
  })

  it('follows the newest major line when picked, and says so', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = mount()
    await applyTheme('Clay')
    expect(store.get(themeSelectionAtom).light).toBe('https://themes.pug.sh/clay/2/theme.json')
    expect(trackEvent).toHaveBeenLastCalledWith('theme_selected', {
      theme: 'clay',
      track: 'major',
      mode: 'both',
      scope: 'personal',
    })
    expect(screen.getByRole('button', { name: 'Follow 2.x' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('follows a named repository’s theme at its own address, and changes track there', async () => {
    vi.stubEnv('VITE_THEME_REPOSITORY', 'https://themes.acme.com')
    serveByUrl({ 'https://themes.acme.com/list.json': CLAY_LIST })
    const store = mount()
    await applyTheme('Clay')
    expect(store.get(themeSelectionAtom).light).toBe('https://themes.acme.com/clay/2/theme.json')
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    expect(store.get(themeSelectionAtom).light).toBe('https://themes.acme.com/clay/theme.json')
  })

  it('reads a saved file as a plain URL once no default claims it', async () => {
    vi.stubEnv('VITE_AIR_GAP', 'true')
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
    expect(screen.getByText(/Using Clay/).textContent).not.toContain('latest')
    expect(screen.queryByRole('group', { name: /updates/i })).toBeNull()
  })

  it.each([
    ['', '', 'themes.pug.sh/name, or a link to a theme file'],
    ['true', 'https://themes.acme.com', 'themes.acme.com/name, or a link to a theme file'],
    ['true', '', 'A link to a theme file'],
  ])('names the default repository in the link field: "%s", "%s"', (airGap, address, placeholder) => {
    vi.stubEnv('VITE_AIR_GAP', airGap)
    vi.stubEnv('VITE_THEME_REPOSITORY', address)
    mount()
    addTheme()
    expect(screen.getAllByPlaceholderText(placeholder).length).toBeGreaterThan(0)
  })

  it('names the repository a followed theme came from', async () => {
    vi.stubEnv('VITE_THEME_REPOSITORY', 'https://themes.acme.com')
    serveByUrl({ 'https://themes.acme.com/list.json': CLAY_LIST })
    mount()
    await applyTheme('Clay')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }))
    expect(await screen.findByText('· by Pug · created Oct 2026 · themes.acme.com')).toBeTruthy()
    expect(screen.queryByText(/themes\.pug\.sh/)).toBeNull()
  })

  it('changes how Your theme follows Clay, saving at once', async () => {
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

  // Review Focus 5. A tile's id is its URL, which changes when it's picked, and the theme in use sorts first. Keyed on
  // that id, the focused button was replaced and the next Tab started from the top of the page.
  it('keeps focus on the button when a theme is applied, and keeps its tile', async () => {
    const CLAY_2 = 'https://themes.pug.sh/clay/2/theme.json'
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_2]: JSON.stringify(clayFile('2.0.0')) })
    const store = mount()
    await openTheme('Clay')
    const before = tile('Clay')
    const use = within(panel()).getByRole('button', { name: 'Use this theme' })
    use.focus()
    fireEvent.click(use)
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_2))
    expect(document.activeElement).toBe(use)
    expect(use.textContent).toBe('In use')
    expect(tile('Clay')).toBe(before)
  })

  it('leaves the track alone on the theme a slot follows', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: 'pug' })
    })
    await act(() => store.set(refreshFetchedThemeAtom, CLAY_1))
    await openTheme('Clay')
    fireEvent.click(within(panel()).getByRole('button', { name: 'In use' }))
    expect(store.get(themeSelectionAtom).light).toBe(CLAY_1)
  })

  it('describes the file a slot follows, not the catalog’s latest', async () => {
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

  it('names Updates by the mode they’re for', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = mount()
    act(() => {
      store.set(themeSelectionAtom, { light: CLAY_1, dark: CLAY_1 })
    })
    expect(await screen.findByRole('group', { name: 'Your theme updates' })).toBeTruthy()
    splitModes()
    expect(screen.getByRole('group', { name: 'Your light theme updates' })).toBeTruthy()
  })

  it('says when the theme repository can’t be read', async () => {
    mount()
    expect(await screen.findByText('Couldn’t reach themes.pug.sh.')).toBeTruthy()
  })

  it('says why Pug shows while a slot’s file loads or fails', async () => {
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
    await findTile('Clay')
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
      store.set(themeModeAtom, 'dark')
      store.set(themeSelectionAtom, { light: 'pug', dark: LATEST })
    })
    await act(() => store.set(refreshFetchedThemeAtom, LATEST))
    expect(await screen.findByText('Clay 2.0.0 has no dark version, so Pug is showing instead.')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Follow 2.x' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '1.x, now 1.1.0' }))
    expect(store.get(themeSelectionAtom).dark).toBe(CLAY_1)
  })

  // Your theme is the mode, so a pin on a pasted URL has nothing to say here, and a stored one would match nothing.
  it('leaves a pasted pin out of Your theme', async () => {
    serveByUrl({ 'https://example.com/clay.json': JSON.stringify(clayFile('1.0.0')) })
    const store = mount()
    check('example.com/clay.json#dark')
    fireEvent.click(await screen.findByRole('button', { name: 'Use this theme' }))
    expect(store.get(themeSelectionAtom).light).toBe('https://example.com/clay.json')
  })

  it('says why a followed release without this mode shows Pug, and lets the slot move on', async () => {
    const url = 'https://themes.pug.sh/clay/1.0.0/theme.json'
    const { light } = clayFile('1.0.0').variants
    serveByUrl({ [LIST_URL]: CLAY_LIST, [url]: JSON.stringify({ ...clayFile('1.0.0'), variants: { light } }) })
    const store = mount()
    act(() => {
      store.set(themeModeAtom, 'dark')
      store.set(themeSelectionAtom, { light: 'pug', dark: url })
    })
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(await screen.findByText('Clay 1.0.0 has no dark version, so Pug is showing instead.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    expect(store.get(themeSelectionAtom).dark).toBe('https://themes.pug.sh/clay/theme.json')
  })

  it('says why a file that lost this mode shows Pug', async () => {
    const url = 'https://example.com/paper.json'
    const paper = { version: 1, name: 'Paper', variants: { light: { colors: { background: '#ffffff' } } } }
    serveByUrl({ [LIST_URL]: CLAY_LIST, [url]: JSON.stringify(paper) })
    const store = mount()
    act(() => {
      store.set(themeModeAtom, 'dark')
      store.set(themeSelectionAtom, { light: 'pug', dark: url })
    })
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Paper has no dark version, so Pug is showing instead.')).toBeTruthy()
  })

  it('uses a theme from a URL for one mode, and refuses one without that mode', async () => {
    const paper = JSON.stringify({
      version: 1,
      name: 'Paper',
      variants: { light: { colors: { background: '#ffffff' } } },
    })
    serveByUrl({ 'https://example.com/paper.json': paper })
    const store = mountIn('dark', { light: 'pug', dark: 'pug' })
    splitModes()
    check('example.com/paper.json')
    expect(await screen.findByText('Paper has no dark variant.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use for dark' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use for light' }))
    expect(store.get(themeSelectionAtom)).toEqual({ light: 'https://example.com/paper.json', dark: 'pug' })
  })
})
