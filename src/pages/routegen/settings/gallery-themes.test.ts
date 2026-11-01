import { afterEach, describe, expect, it, vi } from 'vitest'
import { clayFile } from '@/test/theme-repository'
import type { CatalogTheme } from '@/theme/catalog'
import { parseThemeObject } from '@/theme/format'
import { buildLibrary, type InstalledTheme, type LibraryEntry, type RemoteId, remoteEntries } from '@/theme/library'
import { OFFICIAL_REPOSITORY } from '@/theme/repository'
import type { Polarity } from '@/theme/tokens'
import {
  compiledTheme,
  type GalleryTheme,
  galleryThemes,
  groupThemes,
  isFlat,
  listingOf,
  liveFilters,
  NO_FILTERS,
  siftThemes,
  startingFile,
} from './gallery-themes'

const familyOf = (file: unknown) => {
  const parsed = parseThemeObject(file)
  if (!parsed.ok) throw new Error('refused')
  return parsed.family
}

const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json' as RemoteId
const catalog: CatalogTheme[] = [
  {
    slug: 'clay',
    releases: ['2.0.0', '1.1.0'],
    family: familyOf(clayFile('2.0.0', '#d8cfc0')),
    repository: OFFICIAL_REPOSITORY,
  },
  {
    slug: 'paper',
    releases: ['1.0.0'],
    repository: OFFICIAL_REPOSITORY,
    family: familyOf({ version: 1, name: 'Paper', variants: { light: { colors: { background: '#ffffff' } } } }),
  },
]

const grape: InstalledTheme = {
  id: 'installed-grape',
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file',
}

const paper = (name: string, primary = '#2563eb', metadata = {}): CatalogTheme => ({
  slug: name.toLowerCase(),
  releases: ['1.0.0'],
  repository: OFFICIAL_REPOSITORY,
  family: familyOf({ version: 1, name, metadata, variants: { light: { colors: { background: '#ffffff', primary } } } }),
})

// What a chip lists: a mode it requires, and what it holds, with the family the library has for it.
const slotThemes = (requires: Polarity, target: string, library: LibraryEntry[], themes = catalog) =>
  galleryThemes({
    requires,
    held: { target, family: library.find(entry => entry.id === target)?.family ?? null },
    library,
    catalog: themes,
    shared: false,
  })

const listed = (...themes: CatalogTheme[]) => galleryThemes({ held: null, shared: false, library: [], catalog: themes })

const names = (themes: GalleryTheme[]) => themes.map(theme => theme.name)

describe('galleryThemes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('builds a theme’s file from the repository it came from', () => {
    const acme = catalog.map(theme => ({ ...theme, repository: 'https://themes.acme.com' as RemoteId }))
    const themes = slotThemes('light', 'pug', buildLibrary([]), acme)
    expect(themes.find(t => t.listed?.slug === 'clay')?.id).toBe('https://themes.acme.com/clay/theme.json')
  })

  it('doesn’t take a saved file from another repository for the catalog’s theme of that name', () => {
    vi.stubEnv('VITE_THEME_REPOSITORY', 'https://themes.acme.com')
    const acme = catalog.map(theme => ({ ...theme, repository: 'https://themes.acme.com' as RemoteId }))
    const library = [...buildLibrary([]), ...remoteEntries([{ url: CLAY_1, text: JSON.stringify(clayFile('1.1.0')) }])]
    const themes = slotThemes('light', CLAY_1, library, acme)
    expect(themes.find(t => t.listed?.slug === 'clay')?.held).toBe(false)
  })

  it('offers the built-ins, then the catalog, each only in a mode it has', () => {
    const light = slotThemes('light', 'pug', buildLibrary([]))
    const dark = slotThemes('dark', 'pug', buildLibrary([]))
    expect(names(light).slice(-2)).toEqual(['Clay', 'Paper'])
    expect(names(dark)).not.toContain('Paper')
    expect(light.find(t => t.name === 'Pug')?.held).toBe(true)
  })

  // The fetch cache holds other projects' defaults and URLs someone only tried.
  it('leaves out a fetched file the row doesn’t name', () => {
    const url = 'https://example.com/tried.json' as RemoteId
    const text = JSON.stringify({
      version: 1,
      name: 'Tried',
      variants: { light: { colors: { background: '#fafafa' } } },
    })
    const library = [...buildLibrary([]), ...remoteEntries([{ url, text }])]
    expect(names(slotThemes('light', 'pug', library))).not.toContain('Tried')
  })

  it('marks only the theme it follows', () => {
    const themes = slotThemes('light', CLAY_1, buildLibrary([]))
    expect(themes.find(t => t.listed?.slug === 'paper')).toMatchObject({
      held: false,
      id: 'https://themes.pug.sh/paper/theme.json',
      name: 'Paper',
    })
  })

  it('draws the followed copy, not the catalog’s latest', () => {
    const library = [...buildLibrary([]), ...remoteEntries([{ url: CLAY_1, text: JSON.stringify(clayFile('1.1.0')) }])]
    const clay = slotThemes('light', CLAY_1, library).find(t => t.listed?.slug === 'clay')
    expect(clay?.held).toBe(true)
    expect(clay?.id).toBe(CLAY_1)
    expect(clay?.family?.release).toBe('1.1.0')
  })

  it('shows a followed theme from the catalog before its copy arrives', () => {
    const clay = slotThemes('light', CLAY_1, buildLibrary([])).find(t => t.listed?.slug === 'clay')
    expect(clay?.held).toBe(true)
    expect(clay?.family?.release).toBe('2.0.0')
  })

  it('keeps a followed release without this mode listed, drawn from the catalog', () => {
    const url = 'https://themes.pug.sh/clay/1.0.0/theme.json' as RemoteId
    const { light } = clayFile('1.0.0').variants
    const lightOnly = JSON.stringify({ ...clayFile('1.0.0'), variants: { light } })
    const library = [...buildLibrary([]), ...remoteEntries([{ url, text: lightOnly }])]
    const clay = slotThemes('dark', url, library).find(t => t.listed?.slug === 'clay')
    expect(clay?.held).toBe(true)
    expect(clay?.family?.release).toBe('2.0.0')
  })

  it('draws a followed copy that has this mode when the catalog’s latest lost it', () => {
    const { light } = clayFile('2.0.0').variants
    const family = familyOf({ ...clayFile('2.0.0'), variants: { light } })
    const lightOnly: CatalogTheme[] = [
      { slug: 'clay', releases: ['2.0.0', '1.1.0'], family, repository: OFFICIAL_REPOSITORY },
    ]
    const library = [...buildLibrary([]), ...remoteEntries([{ url: CLAY_1, text: JSON.stringify(clayFile('1.1.0')) }])]
    const clay = slotThemes('dark', CLAY_1, library, lightOnly).find(t => t.listed?.slug === 'clay')
    expect(clay?.held).toBe(true)
    expect(clay?.family?.release).toBe('1.1.0')
  })

  // A copy this build can't read is listed with no family.
  it('draws from the catalog when the followed copy can’t be used', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const library = [...buildLibrary([]), ...remoteEntries([{ url: CLAY_1, text: '{' }])]
    const clay = slotThemes('light', CLAY_1, library).find(t => t.listed?.slug === 'clay')
    expect(clay?.held).toBe(true)
    expect(clay?.family?.release).toBe('2.0.0')
  })

  it('keys a repository theme by its slug, whatever track it follows', () => {
    const LATEST = 'https://themes.pug.sh/clay/theme.json' as RemoteId
    const copies = remoteEntries([
      { url: CLAY_1, text: JSON.stringify(clayFile('1.1.0')) },
      { url: LATEST, text: JSON.stringify(clayFile('2.0.0')) },
    ])
    const clayAt = (target: string) =>
      slotThemes('light', target, [...buildLibrary([]), ...copies]).find(t => t.listed?.slug === 'clay')
    expect(clayAt(CLAY_1)?.id).toBe(CLAY_1)
    expect(clayAt(CLAY_1)?.key).toBe(clayAt(LATEST)?.key)
  })

  it('compiles a library theme under its own id', () => {
    const text = JSON.stringify({ version: 1, name: 'Sloe', variants: { dark: { colors: { background: '#20141f' } } } })
    const library = buildLibrary([{ ...grape, id: 'installed-sloe', hash: 'sloe', text }])
    const sloe = galleryThemes({ held: null, shared: false, library, catalog: [] }).find(t => t.name === 'Sloe')
    if (!sloe?.family) throw new Error('refused')
    expect(compiledTheme({ ...sloe, family: sloe.family }, 'dark')).toMatchObject({
      id: 'installed-sloe',
      builtin: false,
    })
  })

  it('leaves installed themes out of a shared list', () => {
    const themes = galleryThemes({ held: null, shared: true, library: buildLibrary([grape]), catalog: [] })
    expect(names(themes)).not.toContain('Grape')
    expect(names(themes)).toContain('Pug')
  })

  it('keeps an installed theme it can’t use, whatever the mode', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const midnight = { ...grape, text: '{"version":2,"name":"Midnight"}' }
    const themes = slotThemes('dark', 'pug', buildLibrary([midnight]), [])
    expect(themes.find(t => t.id === midnight.id)).toMatchObject({ family: null, source: 'installed' })
  })

  it('starts a repository theme on its newest major line', () => {
    const [clay] = listed({ ...catalog[0], releases: ['2.0.0', '1.0.0'] })
    expect(startingFile(clay)).toBe('https://themes.pug.sh/clay/2/theme.json')
  })
})

describe('listingOf', () => {
  it('finds the catalog theme a file belongs to, on its own repository', () => {
    expect(listingOf(catalog, CLAY_1)).toMatchObject({
      theme: { slug: 'clay' },
      track: { kind: 'major', major: 1 },
    })
    expect(listingOf(catalog, 'https://themes.acme.com/clay/1/theme.json')).toBeNull()
    expect(listingOf(catalog, undefined)).toBeNull()
  })
})

describe('groupThemes', () => {
  const repository = { address: OFFICIAL_REPOSITORY as RemoteId, failed: false }
  const everything = (held: string) =>
    galleryThemes({
      held: { target: held, family: null },
      shared: false,
      library: buildLibrary([grape]),
      catalog: [catalog[0]],
    })

  it('goes built in, installed, then repositories', () => {
    const groups = groupThemes(everything('pug'), [repository])
    expect(groups.map(group => group.source)).toEqual(['builtin', 'installed', OFFICIAL_REPOSITORY])
  })

  it('leaves out a group with nothing in it', () => {
    const themes = galleryThemes({ held: null, shared: false, library: buildLibrary([]), catalog: [] })
    expect(groupThemes(themes, [repository]).map(group => group.source)).toEqual(['builtin'])
  })

  it('puts the theme in use first, so a collapsed group can’t hide it', () => {
    const [builtin] = groupThemes(everything('pug-colourblind'), [repository])
    expect(builtin.themes[0].id).toBe('pug-colourblind')
    expect(builtin.themes.map(theme => theme.id).slice(1)).toEqual(['pug', 'pug-high-contrast'])
  })

  it('keeps a failed repository’s themes beside its failure, or shows it empty', () => {
    const failed = { address: OFFICIAL_REPOSITORY as RemoteId, failed: true }
    expect(groupThemes(listed(catalog[0]), [failed])).toMatchObject([
      { source: OFFICIAL_REPOSITORY, failed: true, themes: [{ name: 'Clay' }] },
    ])
    expect(groupThemes([], [failed])).toEqual([{ source: OFFICIAL_REPOSITORY, themes: [], failed: true }])
  })
})

describe('siftThemes', () => {
  const blue = paper('Blue', '#2563eb', { description: 'Deep OCEAN water' })
  const red = paper('Red', '#c0392b', { author: 'Ada' })
  const green = paper('Green', '#16a34a')
  const grey = paper('Grey', '#777777')
  const four = listed(grey, blue, red, green)

  it('searches name, description and author, ignoring case', () => {
    const search = (query: string) => names(siftThemes(four, { ...NO_FILTERS, query }, 'light'))
    expect(search('ocean')).toEqual(['Blue'])
    expect(search(' ada ')).toEqual(['Red'])
    expect(search('GREEN')).toEqual(['Green'])
  })

  it('orders A to Z', () => {
    expect(names(siftThemes(four, { ...NO_FILTERS, order: 'az' }, 'light'))).toEqual(['Blue', 'Green', 'Grey', 'Red'])
  })

  it('orders by the primary’s hue, near-neutrals last', () => {
    expect(names(siftThemes(four, { ...NO_FILTERS, order: 'colour' }, 'light'))).toEqual([
      'Red',
      'Green',
      'Blue',
      'Grey',
    ])
  })

  it('flattens for a search, a source or an order, and not otherwise', () => {
    expect(isFlat(NO_FILTERS)).toBe(false)
    expect(isFlat({ ...NO_FILTERS, query: '   ' })).toBe(false)
    expect(isFlat({ ...NO_FILTERS, query: 'clay' })).toBe(true)
    expect(isFlat({ ...NO_FILTERS, source: 'installed' })).toBe(true)
    expect(isFlat({ ...NO_FILTERS, order: 'az' })).toBe(true)
  })

  it('drops every filter at six themes or fewer', () => {
    const six = listed(...['a', 'b', 'c', 'd', 'e', 'f'].map(name => paper(name)))
    const seven = listed(...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(name => paper(name)))
    const filters = { ...NO_FILTERS, query: 'a' }
    expect(liveFilters(six, filters)).toEqual(NO_FILTERS)
    expect(liveFilters(seven, filters)).toEqual(filters)
  })

  it('reads a source no theme has as all', () => {
    const seven = listed(...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(name => paper(name)))
    expect(liveFilters(seven, { ...NO_FILTERS, source: 'installed' }).source).toBe('all')
  })
})
