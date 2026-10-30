import { describe, expect, it } from 'vitest'
import { clayFile } from '@/test/theme-repository'
import type { CatalogTheme } from '@/theme/catalog'
import { parseThemeObject } from '@/theme/format'
import { buildLibrary, type RemoteId, remoteEntries } from '@/theme/library'
import { rowThemes } from './row-themes'

const familyOf = (file: unknown) => {
  const parsed = parseThemeObject(file)
  if (!parsed.ok) throw new Error('refused')
  return parsed.family
}

const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json' as RemoteId
const catalog: CatalogTheme[] = [
  { slug: 'clay', releases: ['2.0.0', '1.1.0'], family: familyOf(clayFile('2.0.0', '#d8cfc0')) },
  {
    slug: 'paper',
    releases: ['1.0.0'],
    family: familyOf({ version: 1, name: 'Paper', variants: { light: { colors: { background: '#ffffff' } } } }),
  },
]

describe('rowThemes', () => {
  it('offers the built-ins, then the catalog, each only in a mode it has', () => {
    const light = rowThemes({ polarity: 'light', selected: 'pug', library: buildLibrary([]), catalog })
    const dark = rowThemes({ polarity: 'dark', selected: 'pug', library: buildLibrary([]), catalog })
    expect(light.map(t => t.entry.name).slice(-2)).toEqual(['Clay', 'Paper'])
    expect(dark.map(t => t.entry.name)).not.toContain('Paper')
    expect(light.find(t => t.entry.name === 'Pug')?.selected).toBe(true)
  })

  it('draws the followed copy, not the catalog’s latest', () => {
    const library = [...buildLibrary([]), ...remoteEntries([{ url: CLAY_1, text: JSON.stringify(clayFile('1.1.0')) }])]
    const row = rowThemes({ polarity: 'light', selected: CLAY_1, library, catalog })
    const clay = row.find(t => t.official?.slug === 'clay')
    expect(clay?.selected).toBe(true)
    expect(clay?.entry.id).toBe(CLAY_1)
    expect(clay?.entry.family.release).toBe('1.1.0')
  })

  it('shows a followed theme from the catalog before its copy arrives', () => {
    const row = rowThemes({ polarity: 'light', selected: CLAY_1, library: buildLibrary([]), catalog })
    const clay = row.find(t => t.official?.slug === 'clay')
    expect(clay?.selected).toBe(true)
    expect(clay?.entry.family.release).toBe('2.0.0')
  })

  it('shows a theme from any other URL once it’s fetched', () => {
    const url = 'https://example.com/paper.json' as RemoteId
    const text = JSON.stringify({
      version: 1,
      name: 'Elsewhere',
      variants: { light: { colors: { background: '#fafafa' } } },
    })
    const library = [...buildLibrary([]), ...remoteEntries([{ url, text }])]
    const row = rowThemes({ polarity: 'light', selected: url, library, catalog: [] })
    expect(row.at(-1)).toMatchObject({ selected: true, entry: { id: url, name: 'Elsewhere' } })
  })
})
