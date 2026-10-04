import { createStore } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import type { InstalledTheme } from '@/theme/library'
import {
  compiledThemeAtom,
  installedThemesAtom,
  installThemeAtom,
  removeThemeAtom,
  resolvedThemeAtom,
  themeModeAtom,
  themeRevisionAtom,
  themeSelectionAtom,
} from './theme.atoms'

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

  // Review Focus 4: another tab removes the theme this one is showing.
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

  // Review Focus 1: Safari private mode, or a full quota.
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

// Storage is untrusted: another build, an older shape after a rollback, or a hand edit can put
// anything under these keys, and cross-tab sync delivers it straight into the atoms. A bad value
// must degrade to the default — App reads compiledThemeAtom while rendering, so a throw here is a
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
