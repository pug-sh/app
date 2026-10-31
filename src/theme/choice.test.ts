import { describe, expect, it, vi } from 'vitest'
import { chooseTheme, ignoredPin, missingMode } from './choice'
import { buildLibrary, type InstalledTheme, remoteEntries } from './library'

const LINEN = 'https://themes.pug.sh/linen/theme.json' as const
const grape: InstalledTheme = {
  id: 'installed-grape',
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file',
}
const linenText = JSON.stringify({
  version: 1,
  name: 'Linen',
  variants: { light: { colors: { background: '#f3eee4' } } },
})
// Grape is dark-only and installed; Linen is light-only and fetched.
const library = [...buildLibrary([grape]), ...remoteEntries([{ url: LINEN, text: linenText }])]
const personal = { light: 'pug', dark: 'pug-colourblind' }

describe('chooseTheme', () => {
  it('uses the member’s own choice with no override and no default', () => {
    expect(chooseTheme({ personal, library })).toEqual({ selection: personal, source: 'personal' })
  })

  it('puts the project’s default over the member’s own choice', () => {
    expect(chooseTheme({ projectDefault: 'pug-high-contrast', personal, library })).toEqual({
      selection: { light: 'pug-high-contrast', dark: 'pug-high-contrast' },
      source: 'project',
    })
  })

  it('puts the member’s override over the project’s default', () => {
    expect(chooseTheme({ override: grape.id, projectDefault: 'pug-high-contrast', personal, library })).toEqual({
      selection: { light: grape.id, dark: grape.id },
      source: 'override',
    })
  })

  it('carries a pin the family has a variant for', () => {
    expect(chooseTheme({ projectDefault: `${LINEN}#light`, personal, library })).toMatchObject({
      pin: 'light',
      source: 'project',
    })
  })

  it('ignores a pin the family has no variant for', () => {
    const choice = chooseTheme({ projectDefault: `${LINEN}#dark`, personal, library })
    expect(choice.source).toBe('project')
    expect(choice.pin).toBeUndefined()
  })

  it.each(['no-such-theme', 'installed-gone', 'https://themes.pug.sh/unfetched/theme.json', 'pug#dim', ''])(
    'skips %j down to the member’s own choice',
    projectDefault => {
      expect(chooseTheme({ projectDefault, personal, library }).source).toBe('personal')
    },
  )

  it('falls from an override it can’t use to the project’s default', () => {
    expect(chooseTheme({ override: 'installed-gone', projectDefault: 'pug', personal, library }).source).toBe('project')
  })

  it('skips a theme that is listed but broken', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = 'https://themes.pug.sh/broken/theme.json' as const
    const withBroken = [...library, ...remoteEntries([{ url: broken, text: '{' }])]
    expect(chooseTheme({ override: broken, projectDefault: 'pug', personal, library: withBroken }).source).toBe(
      'project',
    )
  })
})

describe('ignoredPin', () => {
  it('names a pin the file has no variant for, and nothing otherwise', () => {
    expect(ignoredPin(`${LINEN}#dark`, library)).toBe('dark')
    expect(ignoredPin(`${LINEN}#light`, library)).toBeNull()
    expect(ignoredPin(LINEN, library)).toBeNull()
    expect(ignoredPin('', library)).toBeNull()
  })
})

describe('missingMode', () => {
  it('names the mode a file lacks while members can land in it', () => {
    expect(missingMode(LINEN, library)).toBe('dark')
    expect(missingMode(grape.id, library)).toBe('light')
  })

  it('counts a pin the file can’t honour as no pin', () => {
    expect(missingMode(`${LINEN}#dark`, library)).toBe('dark')
  })

  it('has nothing to say about a pin that holds everyone in a mode the file has', () => {
    expect(missingMode(`${LINEN}#light`, library)).toBeNull()
  })

  it.each(['pug', 'https://themes.pug.sh/unfetched/theme.json', 'pug#dim', ''])(
    'has nothing to say about %j',
    value => {
      expect(missingMode(value, library)).toBeNull()
    },
  )
})
