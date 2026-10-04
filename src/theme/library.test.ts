import { describe, expect, it } from 'vitest'
import { buildLibrary, chooseActive, type InstalledTheme } from './library'

const grape: InstalledTheme = {
  id: 'installed-grape',
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file',
}

const choose = (over: Partial<Parameters<typeof chooseActive>[0]> = {}) =>
  chooseActive({
    polarity: 'dark',
    selection: { light: 'pug', dark: 'pug' },
    autoContrast: false,
    moreContrast: false,
    library: buildLibrary([]),
    ...over,
  })

describe('chooseActive', () => {
  it('defaults to Pug', () => {
    expect(choose()).toMatchObject({ id: 'pug', builtin: true, polarity: 'dark' })
  })

  it('uses the selection for the mode', () => {
    const active = choose({ selection: { light: 'pug', dark: grape.id }, library: buildLibrary([grape]) })
    expect(active).toMatchObject({ id: grape.id, builtin: false })
    expect(active.family.name).toBe('Grape')
  })

  it('falls back to Pug for an unknown id', () => {
    expect(choose({ selection: { light: 'gone', dark: 'gone' } }).id).toBe('pug')
  })

  it('swaps in High Contrast only when the OS asks and auto-contrast is on', () => {
    expect(choose({ autoContrast: true, moreContrast: true }).id).toBe('pug-high-contrast')
    expect(choose({ autoContrast: false, moreContrast: true }).id).toBe('pug')
    expect(choose({ autoContrast: true, moreContrast: false }).id).toBe('pug')
  })

  it('falls back to Pug for a family without this mode', () => {
    const library = buildLibrary([grape])
    expect(choose({ polarity: 'light', selection: { light: grape.id, dark: 'pug' }, library }).id).toBe('pug')
  })
})

describe('buildLibrary', () => {
  it('lists the built-ins first', () => {
    expect(
      buildLibrary([grape])
        .map(e => e.id)
        .at(-1),
    ).toBe(grape.id)
    expect(buildLibrary([])[0]).toMatchObject({ id: 'pug', builtin: true, name: 'Pug' })
  })

  it('keeps an installed theme that stopped parsing, unselectable', () => {
    const broken: InstalledTheme = { ...grape, id: 'installed-broken', text: '{' }
    const library = buildLibrary([broken])
    expect(library.find(e => e.id === broken.id)).toMatchObject({ family: null, name: 'Unreadable theme' })
    expect(choose({ selection: { light: 'pug', dark: broken.id }, library }).id).toBe('pug')
  })
})
