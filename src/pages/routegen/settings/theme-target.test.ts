import { describe, expect, it } from 'vitest'
import { modeFor, shownPolarity, targetFor } from '@/pages/routegen/settings/theme-target'
import { clayFile } from '@/test/theme-repository'
import type { CatalogTheme } from '@/theme/catalog'
import { parseThemeObject } from '@/theme/format'
import { OFFICIAL_REPOSITORY } from '@/theme/repository'

const familyOf = (file: unknown) => {
  const parsed = parseThemeObject(file)
  if (!parsed.ok) throw new Error('refused')
  return parsed.family
}

const both = familyOf(clayFile('2.0.0'))
const lightOnly = familyOf({ version: 1, name: 'Paper', variants: { light: { colors: { background: '#ffffff' } } } })
const clay: CatalogTheme = { slug: 'clay', releases: ['2.0.0', '1.1.0'], family: both, repository: OFFICIAL_REPOSITORY }

describe('modeFor', () => {
  it('keeps a chosen mode the file has', () => {
    expect(modeFor(both, 'dark')).toBe('dark')
  })

  it('moves a chosen mode to the one variant a file has', () => {
    expect(modeFor(lightOnly, 'dark')).toBe('light')
  })

  it('keeps a follow someone chose', () => {
    expect(modeFor(lightOnly, 'follow')).toBe('follow')
  })

  it('starts a single-variant file on its one mode', () => {
    expect(modeFor(lightOnly, null)).toBe('light')
    expect(modeFor(both, null)).toBe('follow')
  })
})

describe('shownPolarity', () => {
  it('shows a theme in the mode asked for, or the one it has', () => {
    expect(shownPolarity(both, 'dark')).toBe('dark')
    expect(shownPolarity(lightOnly, 'dark')).toBe('light')
  })
})

describe('targetFor', () => {
  it('carries the catalog’s file for a track that reaches the latest', () => {
    expect(targetFor(clay, { kind: 'major', major: 2 })).toEqual({
      id: 'https://themes.pug.sh/clay/2/theme.json',
      family: both,
    })
  })

  it('leaves a file the catalog doesn’t carry to be read', () => {
    expect(targetFor(clay, { kind: 'major', major: 1 }).family).toBeNull()
  })
})
