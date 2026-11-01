import { describe, expect, it, vi } from 'vitest'
import clay from './__fixtures__/clay.json'
import {
  buildLibrary,
  checkInstall,
  checkThemeText,
  chooseActive,
  type InstalledTheme,
  MAX_INSTALLED,
  remoteEntries,
} from './library'
import { ACCESS_MODES, STANDARD_ACCESS } from './tokens'

const [, HIGH, , BOTH] = ACCESS_MODES

const grape: InstalledTheme = {
  id: 'installed-grape' as const,
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file',
}

const choose = (over: Partial<Parameters<typeof chooseActive>[0]> = {}) =>
  chooseActive({
    polarity: 'dark',
    selection: { light: 'pug', dark: 'pug' },
    access: STANDARD_ACCESS,
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

  it('compiles the chosen theme in the member’s mode', () => {
    expect(choose({ access: HIGH })).toMatchObject({ id: 'pug', access: HIGH })
  })

  const night: InstalledTheme = {
    ...grape,
    id: 'installed-night' as const,
    text: JSON.stringify({
      version: 1,
      name: 'Night',
      contrast: 'high',
      variants: { dark: { colors: { background: '#000000' } } },
    }),
  }

  // A theme that is already high contrast is what the person chose for that need, so it stays.
  it('leaves a high-contrast file in place', () => {
    const library = buildLibrary([night])
    const active = choose({ selection: { light: 'pug', dark: night.id }, access: HIGH, library })
    expect(active.id).toBe(night.id)
  })

  // Review Focus 4.
  it('falls back to Pug in the member’s mode for a family without this mode', () => {
    const library = buildLibrary([grape])
    const active = choose({ polarity: 'light', selection: { light: grape.id, dark: 'pug' }, access: BOTH, library })
    expect(active).toMatchObject({ id: 'pug', access: BOTH })
  })

  // Review Focus 4: a file marked high contrast asked for that, so the Pug standing in for it stays there.
  it('falls back to Pug in High for a high-contrast file without this mode', () => {
    const library = buildLibrary([night])
    expect(choose({ polarity: 'light', selection: { light: night.id, dark: 'pug' }, library })).toMatchObject({
      id: 'pug',
      access: { contrast: 'high', vision: 'standard' },
    })
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

  // Installed text is re-parsed on every load, so a stricter parser (or a rollback to a build that
  // predates the theme's version) can stop reading a theme someone is using. That must not be
  // invisible: it is named as before, and it leaves a trace.
  it('names a theme that stopped parsing, and says so in the console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const midnight: InstalledTheme = {
      ...grape,
      id: 'installed-midnight' as const,
      text: JSON.stringify({ version: 2, name: 'Midnight', variants: {} }),
    }
    expect(buildLibrary([midnight]).find(e => e.id === midnight.id)).toMatchObject({ name: 'Midnight', family: null })
    expect(warn).toHaveBeenCalledWith('theme library: could not read', midnight.id, expect.any(Array))
  })

  it('keeps an installed theme that stopped parsing, unselectable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: InstalledTheme = { ...grape, id: 'installed-broken' as const, text: '{' }
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
      (_, i): InstalledTheme => ({
        ...first.theme,
        id: `installed-t${i}`,
        hash: `h${i}`,
        text: grape.text.replace('Grape', `T${i}`),
      }),
    )
    expect(checkInstall(grape.text, full)).toMatchObject({ ok: false, reason: 'full' })
  })

  // The hash followed the file's order of event colours, so the same theme with two of them swapped
  // installed as a second copy.
  it('treats a file with its event colours reordered as already installed', () => {
    const file = (events: Record<string, string>) =>
      JSON.stringify({ version: 1, name: 'Ev', variants: { dark: { data: { events } } } })
    const first = checkInstall(file({ page_view: '#8be9fd', signin: '#50fa7b' }), [])
    if (!first.ok) throw new Error(JSON.stringify(first.issues))
    expect(checkInstall(file({ signin: '#50fa7b', page_view: '#8be9fd' }), [first.theme])).toMatchObject({
      ok: false,
      reason: 'duplicate',
    })
  })

  // A theme installed by an earlier build carries the hash that build computed.
  it('treats a file installed under an older hash as already installed', () => {
    const file = JSON.stringify({
      version: 1,
      name: 'Ev',
      variants: { dark: { data: { events: { signin: '#50fa7b' } } } },
    })
    const first = checkInstall(file, [])
    if (!first.ok) throw new Error(JSON.stringify(first.issues))
    expect(checkInstall(file, [{ ...first.theme, hash: 'older' }])).toMatchObject({ ok: false, reason: 'duplicate' })
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

describe('checkThemeText', () => {
  it('passes a clean file with its hash, and fails one with errors', () => {
    const clean = checkThemeText(grape.text)
    expect(clean).toMatchObject({ ok: true, issues: [] })
    if (clean.ok) expect(clean.hash).toMatch(/^[0-9a-f]{8}$/)
    expect(checkThemeText('{"version":1}')).toMatchObject({ ok: false })
  })
})

describe('checking every mode', () => {
  const file = (colors: object, modes?: object) =>
    JSON.stringify({ version: 1, name: 'Tuned', variants: { light: { colors, modes } } })

  it('says which mode a problem belongs to', () => {
    const same = 'oklch(0.44 0.1 30)'
    const { issues } = checkThemeText(file({}, { colourblind: { colors: { positive: same, negative: same } } }))
    expect(issues.map(issue => issue.path)).toContain('variants.light.colourblind.positive')
  })

  it('reports a problem a mode shares with standard once', () => {
    const { issues } = checkThemeText(file({ foreground: '#bbbbbb' }))
    const paths = issues.map(issue => issue.path)
    expect(paths).toContain('variants.light.foreground')
    expect(paths.filter(path => path.includes('colourblind'))).toEqual([])
    expect(
      issues.filter(issue => issue.rule === 'V2' && issue.message.startsWith('foreground on background')),
    ).toHaveLength(1)
  })

  it('refuses a mode block whose background has the wrong polarity', () => {
    const check = checkThemeText(file({}, { 'high-contrast': { colors: { background: '#000000' } } }))
    expect(check).toMatchObject({ ok: false })
    expect(check.issues.map(issue => [issue.rule, issue.path])).toContainEqual([
      'V1',
      'variants.light.high-contrast.background',
    ])
  })

  it('checks Clay clean in all eight', () => {
    expect(checkThemeText(JSON.stringify(clay))).toMatchObject({ ok: true, issues: [] })
  })
})

describe('remoteEntries', () => {
  const url = 'https://themes.pug.sh/grape/theme.json' as const

  it('keys a fetched file by its URL, usable when it validates', () => {
    const [entry] = remoteEntries([{ url, text: grape.text }])
    expect(entry).toMatchObject({ id: url, builtin: false, name: 'Grape' })
    expect(entry.family).not.toBeNull()
  })

  it('keeps one that no longer reads listed, but unusable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const [entry] = remoteEntries([{ url, text: '{' }])
    expect(entry.family).toBeNull()
  })

  // compileOnce keys on the family object alone, so a fetched file must not share one with an identical
  // installed file, or the compiled theme would carry the wrong id.
  it('parses a fetched file apart from an identical installed one', () => {
    const [remote] = remoteEntries([{ url, text: grape.text }])
    const installed = buildLibrary([grape]).find(entry => entry.id === grape.id)
    expect(remote.family).not.toBe(installed?.family)
  })

  it('gives the same file fetched from two URLs a family each', () => {
    const [a, b] = remoteEntries([
      { url, text: grape.text },
      { url: 'https://cdn.example.com/grape.json', text: grape.text },
    ])
    expect(a.family).not.toBe(b.family)
  })
})
