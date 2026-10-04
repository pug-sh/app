import { describe, expect, it } from 'vitest'
import { buildLibrary, checkInstall, chooseActive, type InstalledTheme, MAX_INSTALLED } from './library'

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

describe('checkInstall', () => {
  it('accepts a clean theme', () => {
    expect(checkInstall(grape.text, [])).toMatchObject({ ok: true, name: 'Grape', issues: [] })
  })

  it('refuses invalid files, duplicates and a full library', () => {
    expect(checkInstall('{"version":1}', [])).toMatchObject({ ok: false, reason: 'invalid' })
    const first = checkInstall(grape.text, [])
    if (!first.ok) throw new Error('grape did not install')
    // Whitespace doesn't make a second copy: the hash is over the parsed family.
    expect(checkInstall(` ${grape.text}\n`, [first.theme])).toMatchObject({ ok: false, reason: 'duplicate' })
    const full = Array.from(
      { length: MAX_INSTALLED },
      (_, i): InstalledTheme => ({ ...first.theme, id: `t${i}`, hash: `h${i}` }),
    )
    expect(checkInstall(grape.text, full)).toMatchObject({ ok: false, reason: 'full' })
  })

  // A button fill at 10% opacity measured 4.7:1 against itself as if it were solid; its text
  // renders at about 1.1:1. It used to install and read "Passed".
  it('refuses a see-through fill', () => {
    const glass = JSON.stringify({
      version: 1,
      name: 'Glass',
      variants: { light: { colors: { primary: 'oklch(0.55 0.18 265 / 0.1)' } } },
    })
    expect(checkInstall(glass, [])).toMatchObject({ ok: false, reason: 'invalid', issues: [{ rule: 'V5' }] })
  })

  it('refuses a variant whose canvas contradicts its mode', () => {
    const inverted = JSON.stringify({
      version: 1,
      name: 'Inverted',
      variants: { dark: { colors: { background: '#ffffff' } } },
    })
    const check = checkInstall(inverted, [])
    expect(check).toMatchObject({ ok: false, reason: 'invalid' })
    expect(check.issues.some(i => i.rule === 'V1')).toBe(true)
  })

  it('reports warnings without refusing', () => {
    const muddy = JSON.stringify({
      version: 1,
      name: 'Muddy',
      variants: { light: { colors: { foreground: '#bbbbbb' } } },
    })
    const check = checkInstall(muddy, [])
    expect(check.ok).toBe(true)
    expect(check.issues.some(i => i.rule === 'V2' && i.path.startsWith('variants.light.'))).toBe(true)
  })
})
