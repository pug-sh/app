import { createStore } from 'jotai'
import { describe, expect, it } from 'vitest'
import type { InstalledTheme } from '@/theme/library'
import {
  compiledThemeAtom,
  installedThemesAtom,
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
