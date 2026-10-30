import { create } from '@bufbuild/protobuf'
import { createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '@/analytics/pug'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { fakeResponse } from '@/test/fake-response'
import { serveByUrl } from '@/test/serve'
import { clayFile } from '@/test/theme-repository'
import type { InstalledTheme } from '@/theme/library'
import { FETCH_TIMEOUT_MS } from '@/theme/remote'
import {
  activeThemeUrlsAtom,
  autoContrastAtom,
  compiledThemeAtom,
  fetchedThemesAtom,
  fetchStatusAtom,
  installedThemesAtom,
  installThemeAtom,
  projectOverridesAtom,
  refreshFetchedThemeAtom,
  removeThemeAtom,
  resolvedThemeAtom,
  selectThemeAtom,
  setProjectOverrideAtom,
  themeLibraryAtom,
  themeModeAtom,
  themeRevisionAtom,
  themeSelectionAtom,
} from './theme.atoms'

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

const grape: InstalledTheme = {
  id: 'installed-grape',
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file',
}

const darkGrape = () => {
  const store = createStore()
  store.set(themeModeAtom, 'dark')
  store.set(installedThemesAtom, [grape])
  store.set(themeSelectionAtom, { light: 'pug', dark: grape.id })
  return store
}

describe('the active theme', () => {
  it('is Pug in the resolved mode by default', () => {
    const store = createStore()
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug', builtin: true, polarity: 'light' })
    store.set(themeModeAtom, 'dark')
    expect(store.get(resolvedThemeAtom)).toBe('dark')
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug', polarity: 'dark' })
  })

  it('is the installed theme selected for the mode', () => {
    expect(darkGrape().get(compiledThemeAtom)).toMatchObject({ id: grape.id, builtin: false, polarity: 'dark' })
  })

  // Another tab removes the theme this one is showing.
  it('falls back to Pug when the selected theme disappears', () => {
    const store = darkGrape()
    store.set(installedThemesAtom, [])
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug', polarity: 'dark' })
  })

  it('keeps its identity when an unrelated theme is installed', () => {
    const store = darkGrape()
    const before = store.get(compiledThemeAtom)
    store.set(installedThemesAtom, [grape, { ...grape, id: 'installed-other', hash: 'other' }])
    expect(store.get(compiledThemeAtom)).toBe(before)
  })

  it('changes revision between two dark themes', () => {
    const store = darkGrape()
    const grapeRevision = store.get(themeRevisionAtom)
    store.set(themeSelectionAtom, { light: 'pug', dark: 'pug' })
    expect(store.get(themeRevisionAtom)).not.toBe(grapeRevision)
    expect(store.get(resolvedThemeAtom)).toBe('dark')
  })
})

// An OS whose colour scheme the test flips. Listeners are tracked per query, so a test can tell
// whether anything was listening when the OS changed.
const fakeOs = () => {
  const state = { dark: false }
  const listeners = new Map<string, Set<() => void>>()
  const matchMedia = (query: string) => ({
    media: query,
    get matches() {
      return query === '(prefers-color-scheme: dark)' && state.dark
    },
    addEventListener: (_: string, fn: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set())
      listeners.get(query)?.add(fn)
    },
    removeEventListener: (_: string, fn: () => void) => listeners.get(query)?.delete(fn),
  })
  const goDark = () => {
    state.dark = true
    for (const fn of listeners.get('(prefers-color-scheme: dark)') ?? []) fn()
  }
  return { matchMedia, goDark }
}

describe('the OS colour scheme', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Light or Dark mode doesn't read the OS, so nothing listens while the user is in one. Coming back
  // to System has to read the OS again, not reuse what it said before.
  it('is read afresh when System mode comes back', async () => {
    const os = fakeOs()
    vi.stubGlobal('matchMedia', os.matchMedia)
    vi.resetModules()
    const fresh = await import('./theme.atoms')
    const store = createStore()
    store.set(fresh.themeModeAtom, 'light')
    store.sub(fresh.compiledThemeAtom, () => {})

    os.goDark()
    store.set(fresh.themeModeAtom, 'system')

    expect(store.get(fresh.compiledThemeAtom).polarity).toBe('dark')
  })
})

// On by default, so a regression here turns it off for everyone who relies on it, and the first
// paint, which reads the OS itself, would then disagree with React on every load.
describe('auto contrast', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('swaps in Pug High Contrast when the OS asks for more contrast, until it is turned off', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      media: query,
      matches: query === '(prefers-contrast: more)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.resetModules()
    const fresh = await import('./theme.atoms')
    const store = createStore()
    expect(store.get(fresh.compiledThemeAtom).id).toBe('pug-high-contrast')
    store.set(fresh.autoContrastAtom, false)
    expect(store.get(fresh.compiledThemeAtom).id).toBe('pug')
  })
})

describe('installing and removing', () => {
  it('installs a checked file', () => {
    const store = createStore()
    expect(store.set(installThemeAtom, grape.text)).toMatchObject({ ok: true, name: 'Grape' })
    expect(store.get(installedThemesAtom)).toHaveLength(1)
  })

  it('refuses without writing anything', () => {
    const store = createStore()
    expect(store.set(installThemeAtom, '{')).toMatchObject({ ok: false, reason: 'invalid' })
    expect(store.get(installedThemesAtom)).toEqual([])
  })

  // Safari private mode, or a full quota.
  it('reports storage that refuses the write, and leaves nothing half-installed', () => {
    const store = createStore()
    const refuse = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      expect(store.set(installThemeAtom, grape.text)).toMatchObject({ ok: false, reason: 'storage' })
      expect(store.get(installedThemesAtom)).toEqual([])
    } finally {
      refuse.mockRestore()
    }
  })

  it('falls a mode back to Pug when its theme is removed', () => {
    const store = createStore()
    const result = store.set(installThemeAtom, grape.text)
    if (!result.ok) throw new Error('grape did not install')
    store.set(themeSelectionAtom, { light: 'pug', dark: result.theme.id })
    store.set(removeThemeAtom, result.theme.id)
    expect(store.get(installedThemesAtom)).toEqual([])
    expect(store.get(themeSelectionAtom)).toEqual({ light: 'pug', dark: 'pug' })
  })
})

// A full quota, a blocked profile, a disk out of space. atomWithStorage moves memory before it writes,
// so a refused write that isn't put back leaves the session showing what the next load won't have.
describe('storage that refuses a write', () => {
  // Refuses writes to `key`, or to every key when none is given; anything else is written for real.
  let refusal: { mockRestore: () => void } | undefined
  const refuse = (key?: string) => {
    const write = localStorage.setItem.bind(localStorage)
    refusal = vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
      if (key && k !== key) return write(k, v)
      throw new DOMException('full', 'QuotaExceededError')
    })
  }
  // restoreMocks doesn't reach a spy on the storage instance the setup file installs.
  afterEach(() => refusal?.mockRestore())

  it('leaves the selection as it was', () => {
    const store = createStore()
    refuse()
    expect(store.set(selectThemeAtom, { polarity: 'dark', id: 'pug-colourblind' })).toBe(false)
    expect(store.get(themeSelectionAtom)).toEqual({ light: 'pug', dark: 'pug' })
  })

  it('leaves the mode and auto contrast as they were', () => {
    const store = createStore()
    refuse()
    expect(store.set(themeModeAtom, 'dark')).toBe(false)
    expect(store.set(autoContrastAtom, false)).toBe(false)
    expect(store.get(themeModeAtom)).toBe('system')
    expect(store.get(autoContrastAtom)).toBe(true)
  })

  // Removing writes the selection and then the list. When only the list is refused, the selection
  // that did land has to go back too, or a reload shows the theme installed but quietly deselected.
  it('keeps a theme installed and selected when its removal is refused part-way', () => {
    const store = createStore()
    const result = store.set(installThemeAtom, grape.text)
    if (!result.ok) throw new Error('grape did not install')
    store.set(themeSelectionAtom, { light: 'pug', dark: result.theme.id })
    refuse('pug:themes')

    expect(store.set(removeThemeAtom, result.theme.id)).toBe(false)
    expect(store.get(installedThemesAtom).map(t => t.id)).toEqual([result.theme.id])
    expect(store.get(themeSelectionAtom)).toEqual({ light: 'pug', dark: result.theme.id })
    expect(JSON.parse(localStorage.getItem('pug:theme-selection') ?? 'null')).toEqual({
      light: 'pug',
      dark: result.theme.id,
    })
  })
})

// Another build (a newer one with themes installed by URL, say) can store entries this one can't
// read. They are skipped on read, and must survive this build's writes to the same list.
it("keeps installed entries this build can't read through an install and a removal", () => {
  const foreign = { id: 'installed-ref', url: 'https://example.com/theme.json', source: 'url' }
  localStorage.setItem('pug:themes', JSON.stringify([foreign]))
  const store = createStore()
  store.sub(installedThemesAtom, () => {})

  const result = store.set(installThemeAtom, grape.text)
  if (!result.ok) throw new Error('grape did not install')
  expect(JSON.parse(localStorage.getItem('pug:themes') ?? '[]')[0]).toEqual(foreign)
  store.set(removeThemeAtom, result.theme.id)
  expect(JSON.parse(localStorage.getItem('pug:themes') ?? '[]')).toEqual([foreign])
})

// Storage is untrusted: another build, an older shape after a rollback, or a hand edit can put
// anything under these keys, and cross-tab sync delivers it straight into the atoms. A bad value
// must degrade to the default: App reads compiledThemeAtom while rendering, so a throw here is a
// blank app that a reload can't fix.
describe('malformed storage', () => {
  const pug = { id: 'pug', builtin: true }

  it.each<[string, (store: ReturnType<typeof createStore>) => void]>([
    ['mode "auto"', store => store.set(themeModeAtom, 'auto' as never)],
    ['mode 5', store => store.set(themeModeAtom, 5 as never)],
    ['mode null', store => store.set(themeModeAtom, null as never)],
    ['selection null', store => store.set(themeSelectionAtom, null as never)],
    ['selection with a number', store => store.set(themeSelectionAtom, { light: 5, dark: 'pug' } as never)],
    ['installed {}', store => store.set(installedThemesAtom, {} as never)],
    ['installed "x"', store => store.set(installedThemesAtom, 'x' as never)],
    ['installed [null]', store => store.set(installedThemesAtom, [null] as never)],
    ['installed [{ id }]', store => store.set(installedThemesAtom, [{ id: 'x' }] as never)],
  ])('falls back to Pug for %s', (_, seed) => {
    const store = createStore()
    seed(store)
    expect(store.get(compiledThemeAtom)).toMatchObject(pug)
    expect(['light', 'dark']).toContain(store.get(resolvedThemeAtom))
  })

  // An installed entry claiming a built-in's id, or one listed twice, would give the library two
  // entries under one id: duplicate keys, two swatches pressed, and picking one selects the other.
  it('takes only installed-theme ids, once each', () => {
    const store = createStore()
    store.set(installedThemesAtom, [{ ...grape, id: 'pug' }, grape, { ...grape, name: 'again' }] as never)
    expect(store.get(installedThemesAtom).map(t => t.id)).toEqual([grape.id])
    expect(store.get(themeLibraryAtom).filter(entry => entry.id === 'pug')).toHaveLength(1)
  })

  // The case above passes without the guard too: an unknown id falls back to Pug further down.
  // This one reads the guard's own output.
  it('reads a selection that is not a string as Pug', () => {
    const store = createStore()
    store.set(themeSelectionAtom, { light: 5, dark: 'pug-colourblind' } as never)
    expect(store.get(themeSelectionAtom)).toEqual({ light: 'pug', dark: 'pug-colourblind' })
  })

  it('keeps the well-formed installed themes next to a broken entry', () => {
    const store = createStore()
    store.set(installedThemesAtom, [null, grape] as never)
    expect(store.get(installedThemesAtom).map(t => t.id)).toEqual([grape.id])
  })

  it('survives a bad value already in storage when the module loads', async () => {
    localStorage.setItem('pug:theme', JSON.stringify('auto'))
    localStorage.setItem('pug:theme-selection', 'null')
    localStorage.setItem('pug:themes', JSON.stringify({}))
    vi.resetModules()
    const fresh = await import('./theme.atoms')
    expect(createStore().get(fresh.compiledThemeAtom)).toMatchObject(pug)
  })
})

// Another tab's write arrives as a storage event and goes straight into the atoms, well-formed or not.
describe('another tab', () => {
  const fromAnotherTab = (key: string, value: string) => {
    localStorage.setItem(key, value)
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }))
  }

  it('follows its theme changes, and falls back to Pug on a malformed one', () => {
    const store = createStore()
    store.sub(compiledThemeAtom, () => {})
    fromAnotherTab('pug:themes', JSON.stringify([grape]))
    fromAnotherTab('pug:theme-selection', JSON.stringify({ light: 'pug', dark: grape.id }))
    fromAnotherTab('pug:theme', JSON.stringify('dark'))
    expect(store.get(compiledThemeAtom).id).toBe(grape.id)

    fromAnotherTab('pug:theme-selection', '{not json')
    expect(store.get(compiledThemeAtom).id).toBe('pug')
  })
})

describe('project themes', () => {
  const LINEN = 'https://themes.pug.sh/linen/theme.json'
  const linenText = JSON.stringify({
    version: 1,
    name: 'Linen',
    variants: { light: { colors: { background: '#f3eee4' } } },
  })
  const inProject = (defaultTheme: string, id = 'p1') => {
    const store = createStore()
    store.set(activeProjectAtom, create(ProjectSchema, { id, displayName: 'P', defaultTheme }))
    return store
  }
  const serve = (...responses: Response[]) => {
    const fetcher = vi.fn()
    for (const response of responses) fetcher.mockResolvedValueOnce(response)
    vi.stubGlobal('fetch', fetcher)
    return fetcher
  }

  beforeEach(() => vi.mocked(trackEvent).mockClear())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows the project’s default over the member’s own choice', () => {
    expect(inProject('pug-colourblind').get(compiledThemeAtom)).toMatchObject({ id: 'pug-colourblind' })
  })

  it('lets this browser override it per project, and reports the override', () => {
    const store = inProject('pug-colourblind')
    expect(store.set(setProjectOverrideAtom, { projectId: 'p1', reference: 'pug-high-contrast' })).toBe(true)
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug-high-contrast' })
    expect(trackEvent).toHaveBeenCalledWith('theme_selected', {
      theme: 'pug-high-contrast',
      mode: 'both',
      scope: 'project',
    })
    store.set(setProjectOverrideAtom, { projectId: 'p1', reference: null })
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug-colourblind' })
  })

  it('pins the mode when the reference says so', () => {
    const store = inProject('pug#dark')
    expect(store.get(resolvedThemeAtom)).toBe('dark')
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug', polarity: 'dark' })
  })

  it('paints the member’s own choice until a URL theme has been fetched', async () => {
    serve(fakeResponse(linenText))
    const store = inProject(`${LINEN}#light`)
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug' })
    await store.set(refreshFetchedThemeAtom, LINEN)
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: LINEN, builtin: false, polarity: 'light' })
    expect(store.get(fetchStatusAtom)[LINEN]).toEqual({ state: 'ok', warnings: 0 })
  })

  // A bad push or a dead host never replaces the copy members are using.
  it('keeps the last good copy when the file breaks or disappears', async () => {
    serve(
      fakeResponse(linenText),
      fakeResponse('{"version":1,"name":"Linen","variants":{}}'),
      fakeResponse('', { status: 404 }),
    )
    const store = inProject(LINEN)
    await store.set(refreshFetchedThemeAtom, LINEN)
    await store.set(refreshFetchedThemeAtom, LINEN)
    expect(store.get(fetchStatusAtom)[LINEN]).toMatchObject({ state: 'failed', reason: 'invalid' })
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: LINEN })
    await store.set(refreshFetchedThemeAtom, LINEN)
    expect(store.get(fetchStatusAtom)[LINEN]).toEqual({ state: 'failed', reason: 'status', status: 404 })
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: LINEN })
  })

  // A fetch that never ends would hold "Checking the file…" for the session, and every later refresh
  // would join it, so a host that recovers would never be asked again. Its own URL: a fetch that hangs
  // stays shared for the whole file.
  it('gives up on a host that stalls, and asks again next time', async () => {
    const SLOW = 'https://slow.example/theme.json'
    vi.useFakeTimers()
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    )
    vi.stubGlobal('fetch', fetcher)
    const store = inProject(SLOW)
    const first = store.set(refreshFetchedThemeAtom, SLOW)
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS)
    await first
    expect(store.get(fetchStatusAtom)[SLOW]).toEqual({ state: 'failed', reason: 'timeout' })
    void store.set(refreshFetchedThemeAtom, SLOW)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('shares one fetch between concurrent refreshes', async () => {
    const fetcher = serve(fakeResponse(linenText))
    const store = inProject(LINEN)
    await Promise.all([store.set(refreshFetchedThemeAtom, LINEN), store.set(refreshFetchedThemeAtom, LINEN)])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps the ten most recently fetched files', async () => {
    const store = inProject('')
    const urls = Array.from({ length: 11 }, (_, i) => `https://themes.pug.sh/t${i}/theme.json` as const)
    for (const url of urls) {
      serve(fakeResponse(linenText))
      await store.set(refreshFetchedThemeAtom, url)
    }
    const kept = Object.keys(store.get(fetchedThemesAtom))
    expect(kept).toHaveLength(10)
    expect(kept).not.toContain(urls[0])
  })

  // A cache, not a setting: the copy serves this session even when storage says no.
  it('still shows a fetched theme this session when storage refuses to keep it', async () => {
    serve(fakeResponse(linenText))
    const store = inProject(`${LINEN}#light`)
    const refusal = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      await store.set(refreshFetchedThemeAtom, LINEN)
    } finally {
      refusal.mockRestore()
    }
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: LINEN })
  })

  // The late answer lands in the cache, but the new project paints its own theme.
  it('paints the project now active when an earlier project’s fetch lands late', async () => {
    let release: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(resolve => (release = resolve))),
    )
    const store = inProject(`${LINEN}#light`)
    const pending = store.set(refreshFetchedThemeAtom, LINEN)
    store.set(activeProjectAtom, create(ProjectSchema, { id: 'p2', displayName: 'Q', defaultTheme: 'pug-colourblind' }))
    release(fakeResponse(linenText))
    await pending
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug-colourblind' })
  })

  // Mounted, as the app has it: getOnInit read storage once, at import.
  it('reads stored overrides it can’t use as none', () => {
    localStorage.setItem('pug:theme-project-overrides', '{"p1":"pug#dim","__proto__":"pug","p2":7}')
    const store = inProject('pug-colourblind')
    store.sub(projectOverridesAtom, () => {})
    expect(store.get(projectOverridesAtom)).toEqual({})
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug-colourblind' })
  })

  it('treats a project default this build can’t read as none', () => {
    expect(inProject('pug#dim').get(compiledThemeAtom)).toMatchObject({ id: 'pug' })
  })

  it('lets a pin beat the member’s own mode, both ways', () => {
    const store = inProject('pug#dark')
    store.set(themeModeAtom, 'light')
    expect(store.get(resolvedThemeAtom)).toBe('dark')
    store.set(activeProjectAtom, create(ProjectSchema, { id: 'p1', displayName: 'P', defaultTheme: 'pug#light' }))
    store.set(themeModeAtom, 'dark')
    expect(store.get(resolvedThemeAtom)).toBe('light')
  })

  // Installs keep what another build stored; overrides have to as well.
  it('keeps overrides this build can’t read when it saves one', () => {
    localStorage.setItem('pug:theme-project-overrides', JSON.stringify({ p2: 'gh:acme/brand' }))
    const store = inProject('')
    store.sub(projectOverridesAtom, () => {})
    store.set(setProjectOverrideAtom, { projectId: 'p1', reference: 'pug' })
    expect(JSON.parse(localStorage.getItem('pug:theme-project-overrides') ?? 'null')).toEqual({
      p2: 'gh:acme/brand',
      p1: 'pug',
    })
  })

  it('drops overrides naming a theme it removes', () => {
    const store = inProject('')
    store.set(installedThemesAtom, [grape])
    store.set(setProjectOverrideAtom, { projectId: 'p1', reference: `${grape.id}#dark` })
    store.set(removeThemeAtom, grape.id)
    expect(store.get(projectOverridesAtom)).toEqual({})
  })
})

describe('the member’s own theme by URL', () => {
  const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json'

  beforeEach(() => vi.mocked(trackEvent).mockClear())
  afterEach(() => vi.unstubAllGlobals())

  it('is kept fresh, and paints once fetched', async () => {
    serveByUrl({ [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    const store = createStore()
    store.set(themeModeAtom, 'light')
    store.set(selectThemeAtom, { polarity: 'light', id: CLAY_1 })
    expect(store.get(activeThemeUrlsAtom)).toEqual([CLAY_1])
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: 'pug' })
    await store.set(refreshFetchedThemeAtom, CLAY_1)
    expect(store.get(compiledThemeAtom)).toMatchObject({ id: CLAY_1, builtin: false, polarity: 'light' })
  })

  it('reports an official theme by slug and track, and any other URL as custom', () => {
    const store = createStore()
    store.set(selectThemeAtom, { polarity: 'dark', id: CLAY_1 })
    expect(trackEvent).toHaveBeenLastCalledWith('theme_selected', {
      theme: 'clay',
      track: 'major',
      mode: 'dark',
      scope: 'personal',
    })
    store.set(selectThemeAtom, { polarity: 'dark', id: 'https://example.com/paper.json' })
    expect(trackEvent).toHaveBeenLastCalledWith('theme_selected', { theme: 'custom', mode: 'dark', scope: 'personal' })
  })

  it('reports an official project override by slug and track', () => {
    const store = createStore()
    store.set(setProjectOverrideAtom, {
      projectId: 'p1',
      reference: 'https://themes.pug.sh/clay/1.0.0/theme.json#dark',
    })
    expect(trackEvent).toHaveBeenLastCalledWith('theme_selected', {
      theme: 'clay',
      track: 'exact',
      mode: 'dark',
      scope: 'project',
    })
  })
})
