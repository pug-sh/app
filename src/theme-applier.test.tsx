import { create } from '@bufbuild/protobuf'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { type Project, ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { fakeResponse } from '@/test/fake-response'
import { jwtFor } from '@/test/jwt'
import { runPaintScript } from '@/test/paint-script'

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  const pending = () => new Promise(() => {})
  return {
    projectsRPCAtom: atom({ batchGet: pending }),
    orgsRPCAtom: atom({ list: pending, get: pending, updateDisplayName: pending }),
    billingRPCAtom: atom({ getBillingStatus: pending }),
    usageRPCAtom: atom({ getUsage: pending }),
  }
})

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

// The screens are beside the point here, and each would call RPCs this file doesn't fake.
vi.mock('@/pages/router', () => ({ default: () => null }))
vi.mock('@/components/layout/sidebar', () => ({ default: () => null }))
vi.mock('@/pages/shared-dashboard', () => ({ default: () => null }))
vi.mock('@/pages/sign-in', () => ({ default: () => null }))

// A signed-in App preloads its landing page, and the real overview's ~2s import times these out under load.
vi.mock('@/pages/routegen/overview/index.page', () => ({ default: () => null }))

// An OS the test can flip, installed before App loads: the theme atoms read the OS when their module
// is first imported.
const DARK = '(prefers-color-scheme: dark)'
const os = { dark: false }
const listeners = new Set<() => void>()
vi.stubGlobal('matchMedia', (query: string) => ({
  media: query,
  get matches() {
    return query === DARK && os.dark
  },
  addEventListener: (_: string, fn: () => void) => {
    if (query === DARK) listeners.add(fn)
  },
  removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
}))

const { default: App } = await import('./App')
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')
const {
  compiledThemeAtom,
  fetchedThemesAtom,
  fetchStatusAtom,
  installThemeAtom,
  removeThemeAtom,
  selectThemeAtom,
  setProjectOverrideAtom,
  themeModeAtom,
  themeSelectionAtom,
} = await import('@/data/theme.atoms')
const { activeOrgAtom, activeProjectAtom, bootstrapStatusAtom, commitProjectsAtom } = await import(
  '@/data/workspace.atoms'
)
const { PAINT_CACHE_KEY } = await import('@/theme/paint-cache')
const { TOKENS } = await import('@/theme/tokens')

const root = document.documentElement
const inline = () => TOKENS.filter(t => root.style.getPropertyValue(`--${t}`) !== '')
const GRAPE = JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } })
const orgA = create(OrgSchema, { id: 'org-a', displayName: 'Org A' })

type Mount = {
  path?: string
  signedIn?: boolean
  settled?: boolean
  project?: Project
  seed?: (store: ReturnType<typeof createStore>) => void
}

// A settled workspace has its org picked and its project list landed, with `project` active when given.
const settle = (store: ReturnType<typeof createStore>, project?: Project) => {
  store.set(activeOrgAtom, orgA)
  store.set(commitProjectsAtom, { orgId: orgA.id, projects: project ? [project] : [] })
  if (project) store.set(activeProjectAtom, project)
  store.set(bootstrapStatusAtom, 'ready')
}

// The real App. An unsettled workspace is still loading, and stays so until a test settles it.
const mount = ({ path = '/', signedIn = true, settled = true, project, seed }: Mount = {}) => {
  const store = createStore()
  seed?.(store)
  if (signedIn) {
    store.set(refreshTokenAtom, 'refresh-token')
    store.set(jwtAtom, jwtFor('cust-1'))
  }
  if (signedIn && settled) settle(store, project)
  render(
    <Provider store={store}>
      <Router hook={memoryLocation({ path }).hook}>
        <App />
      </Router>
    </Provider>,
  )
  return store
}

afterEach(() => {
  os.dark = false
  root.className = ''
  root.removeAttribute('data-theme')
  root.removeAttribute('style')
  window.history.replaceState(null, '', '/')
})

// The first-paint script sets <html> once, before React. Every mode change, selection and removal after
// that reaches the page only through App, so these render the real one.
describe('the theme on <html>', () => {
  it('follows the mode as it changes', () => {
    const store = mount()
    act(() => store.set(themeModeAtom, 'dark'))
    expect(root.classList.contains('dark')).toBe(true)
    act(() => store.set(themeModeAtom, 'light'))
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('carries an installed theme as inline variables, and drops them when it is removed', () => {
    const store = mount()
    act(() => store.set(themeModeAtom, 'dark'))
    const result = store.set(installThemeAtom, GRAPE)
    if (!result.ok) throw new Error('grape did not install')
    act(() => store.set(selectThemeAtom, { polarity: 'dark', id: result.theme.id }))
    expect(root.style.getPropertyValue('--background')).toBe(store.get(compiledThemeAtom).vars['--background'])
    expect(inline()).toHaveLength(TOKENS.length)

    act(() => store.set(removeThemeAtom, result.theme.id))
    expect(inline()).toEqual([])
    expect(root.classList.contains('dark')).toBe(true)
  })

  // Light mode doesn't ask the OS, so nothing hears it change. Switching to System has to.
  it('reads the OS again when System mode comes back', () => {
    const store = mount()
    act(() => store.set(themeModeAtom, 'light'))
    act(() => {
      os.dark = true
      for (const fn of listeners) fn()
    })
    act(() => store.set(themeModeAtom, 'system'))
    expect(root.classList.contains('dark')).toBe(true)
  })
})

// index.html paints the URL's project from its cache. Until the workspace has picked that project, React
// knows less than the script did, so the paint has to survive it.
describe('the first paint, handed to React', () => {
  const pug = { builtin: 'pug', standard: true }
  const colourblind = { builtin: 'pug-colourblind', standard: true }
  // Pinned dark, where the member's own is Pug following a light OS.
  const pinned = create(ProjectSchema, { id: 'p1', displayName: 'First', defaultTheme: 'pug#dark' })

  it('keeps the project’s paint while the workspace loads', () => {
    localStorage.setItem(
      PAINT_CACHE_KEY,
      JSON.stringify({
        v: 2,
        autoContrast: false,
        personal: { light: pug, dark: pug },
        projects: { p1: { pin: 'dark', light: colourblind, dark: colourblind } },
      }),
    )
    window.history.replaceState(null, '', '/p/p1/overview')
    runPaintScript()
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
    mount({ path: '/p/p1/overview', settled: false })
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })

  it('paints the project’s theme once the workspace has picked it', () => {
    mount({ path: '/p/p1/overview', project: pinned })
    expect(root.classList.contains('dark')).toBe(true)
  })

  // The cached paint is stale: p1's default was cleared since, so settling has to repaint even though the
  // theme React holds didn't change.
  it('repaints when the workspace settles on a project with no theme now', () => {
    localStorage.setItem(
      PAINT_CACHE_KEY,
      JSON.stringify({
        v: 2,
        autoContrast: false,
        personal: { light: pug, dark: pug },
        projects: { p1: { light: colourblind, dark: colourblind } },
      }),
    )
    window.history.replaceState(null, '', '/p/p1/overview')
    runPaintScript()
    const store = mount({ path: '/p/p1/overview', settled: false })
    act(() => settle(store, create(ProjectSchema, { id: 'p1', displayName: 'First' })))
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('keeps the project’s paint for the next load', () => {
    mount({ path: '/p/p1/overview', project: pinned })
    expect(JSON.parse(localStorage.getItem(PAINT_CACHE_KEY) ?? 'null')).toMatchObject({
      v: 3,
      contrast: 'system',
      vision: 'standard',
      last: 'p1',
      projects: { p1: { pin: 'dark', dark: { standard: { builtin: 'pug' }, high: { builtin: 'pug-high-contrast' } } } },
    })
  })

  // Neither has a workspace coming: the shared route mounts no bootstrap, and signing out resets it.
  it('paints the member’s own on a shared dashboard', () => {
    root.classList.add('dark')
    mount({ path: '/shared/s1', settled: false })
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('paints the member’s own while signed out', () => {
    root.classList.add('dark')
    mount({ signedIn: false })
    expect(root.classList.contains('dark')).toBe(false)
  })
})

describe('a member’s own theme by URL', () => {
  const CLAY = 'https://themes.pug.sh/clay/1/theme.json'
  const clay = JSON.stringify({ version: 1, name: 'Clay', variants: { light: { colors: { background: '#f3eee4' } } } })

  // A real load reads these at import, through getOnInit, so its first render has them. A second mount shares
  // that import, and jotai won't re-render App for what storage gives it on mount, so it fetches nothing
  // unless it's handed what the load would have read.
  const reload = () =>
    mount({
      seed: store => {
        store.set(themeSelectionAtom, JSON.parse(localStorage.getItem('pug:theme-selection') ?? 'null'))
        store.set(fetchedThemesAtom, JSON.parse(localStorage.getItem('pug:theme-remote') ?? '{}'))
      },
    })

  afterEach(() => vi.unstubAllGlobals())

  it('still paints after an offline reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(clay)),
    )
    const store = mount()
    act(() => store.set(themeModeAtom, 'light'))
    act(() => store.set(selectThemeAtom, { polarity: 'light', id: CLAY }))
    await waitFor(() => expect(inline()).toHaveLength(TOKENS.length))
    const background = root.style.getPropertyValue('--background')

    // The reload: nothing on the page, no network, and only what the browser kept.
    cleanup()
    root.removeAttribute('style')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    runPaintScript()
    expect(root.style.getPropertyValue('--background')).toBe(background)
    const reloaded = reload()
    await waitFor(() => expect(reloaded.get(fetchStatusAtom)[CLAY]).toMatchObject({ state: 'failed' }))
    expect(root.style.getPropertyValue('--background')).toBe(background)
  })

  // What Latest and Follow promise. A load that trusted its cached copy would leave a member on the
  // release they first fetched.
  it('brings in a newer file on the next load', async () => {
    const newer = JSON.stringify({
      version: 1,
      name: 'Clay',
      variants: { light: { colors: { background: '#dcd2c0' } } },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(clay)),
    )
    const store = mount()
    act(() => store.set(themeModeAtom, 'light'))
    act(() => store.set(selectThemeAtom, { polarity: 'light', id: CLAY }))
    await waitFor(() => expect(inline()).toHaveLength(TOKENS.length))
    const background = root.style.getPropertyValue('--background')

    cleanup()
    root.removeAttribute('style')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(newer)),
    )
    reload()
    await waitFor(() => {
      expect(root.style.getPropertyValue('--background')).not.toBe('')
      expect(root.style.getPropertyValue('--background')).not.toBe(background)
    })
  })
})

describe('theme files a project names', () => {
  const LINEN = 'https://themes.pug.sh/linen/theme.json'
  const linen = JSON.stringify({
    version: 1,
    name: 'Linen',
    variants: { light: { colors: { background: '#f3eee4' } } },
  })

  afterEach(() => vi.unstubAllGlobals())

  it('fetches the files the project names, and paints one once it lands', async () => {
    const fetcher = vi.fn(async () => fakeResponse(linen))
    vi.stubGlobal('fetch', fetcher)
    const store = mount({
      path: '/p/p1/overview',
      project: create(ProjectSchema, { id: 'p1', displayName: 'First', defaultTheme: `${LINEN}#light` }),
    })
    await waitFor(() => expect(inline()).toHaveLength(TOKENS.length))
    const override = 'https://themes.pug.sh/other/theme.json'
    act(() => {
      store.set(setProjectOverrideAtom, { projectId: 'p1', reference: override })
    })
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(override, expect.anything()))
    expect(fetcher).toHaveBeenCalledWith(LINEN, expect.anything())
  })

  // An admin who fixed the host saves the same file again, and that has to ask for it again.
  it('fetches again when the project is saved with the same file', async () => {
    const DOWN = 'https://themes.pug.sh/down/theme.json'
    const fetcher = vi.fn(async () => fakeResponse('', { status: 503 }))
    vi.stubGlobal('fetch', fetcher)
    const project = () => create(ProjectSchema, { id: 'p1', displayName: 'First', defaultTheme: DOWN })
    const store = mount({ path: '/p/p1/overview', project: project() })
    await waitFor(() => expect(store.get(fetchStatusAtom)[DOWN]).toMatchObject({ state: 'failed' }))
    act(() => store.set(activeProjectAtom, project()))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })
})
