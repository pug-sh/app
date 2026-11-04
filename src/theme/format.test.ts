import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseColor } from '../lib/color/parse'
import { authoringSchema, MAX_THEME_BYTES, type ParseResult, parseThemeObject, parseThemeText } from './format'

const minimal = { version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }

describe('parseThemeObject', () => {
  it('reads a minimal theme', () => {
    const result = parseThemeObject(minimal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.issues).toEqual([])
    expect(result.family.contrast).toBe('standard')
    expect(result.family.variants.dark?.colors.background).toMatchObject({ alpha: 1 })
    expect(result.family.variants.dark?.data.adapt).toBe(true)
  })

  it('drops unknown keys with a warning and a suggestion', () => {
    const result = parseThemeObject({
      ...minimal,
      radius: '0.5rem',
      variants: { dark: { colors: { background: '#1e1b2e', foregrund: '#fff', 'font-sans': 'Inter' } } },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const messages = result.issues.map(i => `${i.rule} ${i.path}: ${i.message}`)
    expect(messages).toContain('V12 radius: Unknown key "radius" was ignored')
    expect(messages.some(m => m.includes('foregrund') && m.includes('did you mean "foreground"'))).toBe(true)
    expect(messages.some(m => m.includes('font-sans'))).toBe(true)
  })

  it('never copies an unknown key onto anything: __proto__ is just another unknown token', () => {
    const result = parseThemeText(
      '{"version":1,"name":"x","variants":{"light":{"colors":{"__proto__":"#fff","background":"#fff"}}}}',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.family.variants.light?.colors ?? {})).toEqual(['background'])
    expect(({} as Record<string, unknown>).background).toBeUndefined()
  })

  it('refuses a colour outside the grammar, naming where it is', () => {
    const result = parseThemeObject({ ...minimal, variants: { dark: { colors: { background: 'redd' } } } })
    expect(result).toEqual({
      ok: false,
      issues: [
        { severity: 'error', rule: 'V13', path: 'variants.dark.colors.background', message: '"redd" is not a colour' },
      ],
    })
  })

  // Contrast is measured against a surface as if it were solid, and other surfaces are derived from
  // its lightness, so a see-through one passes every check and renders unreadable.
  it('refuses a see-through surface or fill, naming where it is', () => {
    const result = parseThemeObject({
      ...minimal,
      variants: {
        dark: { colors: { background: '#1e1b2e', sidebar: '#ffffff08', primary: 'oklch(0.55 0.18 265 / 0.1)' } },
      },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.map(i => `${i.severity} ${i.rule} ${i.path}`)).toEqual([
      'error V5 variants.dark.colors.primary',
      'error V5 variants.dark.colors.sidebar',
    ])
  })

  it('still takes a see-through line or ink', () => {
    const colors = {
      background: '#1e1b2e',
      border: 'oklch(0.68 0.022 265 / 0.22)',
      'muted-foreground': 'rgb(255 255 255 / 0.6)',
    }
    expect(parseThemeObject({ ...minimal, variants: { dark: { colors } } })).toMatchObject({ ok: true, issues: [] })
  })

  it('refuses a newer version and an oversized file', () => {
    expect(parseThemeObject({ ...minimal, version: 2 })).toMatchObject({
      ok: false,
      issues: [{ message: 'This theme needs a newer version of Pug' }],
    })
    expect(parseThemeText(' '.repeat(MAX_THEME_BYTES + 1))).toMatchObject({ ok: false })
  })

  it('needs at least one variant', () => {
    expect(parseThemeObject({ version: 1, name: 'x', variants: {} })).toMatchObject({ ok: false })
  })

  it('strips control and direction-override characters from metadata', () => {
    const result = parseThemeObject({ ...minimal, name: 'Pug\u202e (official)', author: 'a\u0007b' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.family.name).toBe('Pug (official)')
    expect(result.family.author).toBe('ab')
    expect(result.issues.filter(i => i.rule === 'V12')).toHaveLength(2)
  })

  // The shape asks the raw name for one character, but cleaning runs after it, and a zero-width space
  // survives cleaning and trimming both. Each of these installed blank: an unlabelled row, a nameless
  // swatch, "Installed " in a toast.
  it.each([
    ['spaces', '   '],
    ['a direction override', '\u202e'],
    ['controls, an override and a space', '\u0007\u202e '],
    ['a zero-width space', '\u200b'],
  ])('refuses a name of only %s', (_label, name) => {
    const result = parseThemeObject({ ...minimal, name })
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', rule: 'V13', path: 'name' }))
  })

  it('trims the space around a name', () => {
    const result = parseThemeObject({ ...minimal, name: '  Nord  ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.family.name).toBe('Nord')
  })

  // A theme's keys and values come back inside its own issue messages, which the install report
  // renders, so the cleaning that keeps a direction override out of a name keeps it out of those too.
  it('keeps control and direction-override characters out of its own messages', () => {
    const result = parseThemeObject({ ...minimal, 'x\u202eevil': 1 })
    expect(result.issues).toHaveLength(1)
    for (const issue of result.issues) {
      expect(issue.path).not.toMatch(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/)
      expect(issue.message).not.toMatch(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/)
    }
  })

  // Both are reserved or meaningless today, and both used to vanish without a word.
  it("warns that seeds and a data colour's alpha are ignored", () => {
    const result = parseThemeObject({
      ...minimal,
      seeds: { primary: '#ff0000' },
      variants: {
        dark: { colors: { background: '#1e1b2e' }, data: { categorical: ['#ff000080', '#00ff00', '#0000ff'] } },
      },
    })
    expect(result.ok).toBe(true)
    expect(result.issues.map(i => `${i.severity} ${i.rule} ${i.path}`)).toEqual([
      'warning V12 seeds',
      'warning V12 variants.dark.data.categorical.0',
    ])
  })

  it('keys event colours by their canonical kind', () => {
    const result = parseThemeObject({ ...minimal, variants: { dark: { data: { events: { pageView: '#8be9fd' } } } } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.family.variants.dark?.data.events ?? {})).toEqual(['page_view'])
  })

  // Three ways an event key used to vanish without the warning every other ignored key gets. Text, not an
  // object literal: only JSON.parse makes "__proto__" an ordinary key.
  it('warns about event keys it ignores', () => {
    const result = parseThemeText(
      '{"version":1,"name":"Grape","variants":{"dark":{"data":{"events":' +
        '{"__proto__":"#ff0000","---":"#00ff00","page_view":"#111111","pageView":"#222222","constructor":"#333333"}}}}}',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const messages = result.issues.map(i => `${i.rule} ${i.path}: ${i.message}`)
    expect(messages).toContain(
      'V12 variants.dark.data.events.__proto__: "__proto__" can’t name an event, so it was ignored',
    )
    expect(messages).toContain('V12 variants.dark.data.events.---: "---" names no event, so it was ignored')
    expect(messages).toContain(
      'V12 variants.dark.data.events.pageView: "pageView" is the same event as "page_view", so it was ignored',
    )
    const events = result.family.variants.dark?.data.events ?? {}
    expect(Object.keys(events).sort()).toEqual(['constructor', 'page_view'])
    expect(events.page_view).toEqual(parseColor('#111111'))
  })
})

describe('authoringSchema', () => {
  it('exports a strict JSON Schema that lists every token for autocomplete', () => {
    const schema = JSON.stringify(z.toJSONSchema(authoringSchema))
    expect(schema).toContain('"sidebar-accent-foreground"')
    expect(schema).toContain('"failure"')
    expect(schema).toContain('"additionalProperties":false')
  })

  it('offers metadata to editors, and no longer the top-level author and description', () => {
    const schema = z.toJSONSchema(authoringSchema) as {
      properties: Record<string, { properties?: Record<string, unknown> } | undefined>
    }
    expect(Object.keys(schema.properties.metadata?.properties ?? {})).toEqual([
      'author',
      'description',
      'created',
      'release',
    ])
    expect(schema.properties.author).toBeUndefined()
    expect(schema.properties.description).toBeUndefined()
  })
})

describe('metadata', () => {
  const withMetadata = (metadata: unknown, rest: Record<string, unknown> = {}) =>
    parseThemeObject({ ...minimal, ...rest, metadata })
  const familyOf = (result: ParseResult) => {
    if (!result.ok) throw new Error('refused')
    return result.family
  }
  const messages = (result: ParseResult) => result.issues.map(i => `${i.rule} ${i.path}: ${i.message}`)

  it('reads author, description, created and release', () => {
    const result = withMetadata({
      author: 'Pug',
      description: 'Warm linen paper.',
      created: '2026-10-13',
      release: '1.0.0',
    })
    expect(result.issues).toEqual([])
    expect(familyOf(result)).toMatchObject({
      author: 'Pug',
      description: 'Warm linen paper.',
      created: '2026-10-13',
      release: '1.0.0',
    })
  })

  it('still reads a top-level author and description, silently', () => {
    const result = parseThemeObject({ ...minimal, author: 'Pug', description: 'The old place.' })
    expect(result.issues).toEqual([])
    expect(familyOf(result)).toMatchObject({ author: 'Pug', description: 'The old place.' })
  })

  it('prefers metadata over the top level', () => {
    const family = familyOf(withMetadata({ author: 'New' }, { author: 'Old', description: 'Kept' }))
    expect(family).toMatchObject({ author: 'New', description: 'Kept' })
  })

  // The family is hashed for "already installed", so a file without the new keys must parse as before.
  it('parses a file without metadata to exactly the family it did before', () => {
    expect(Object.keys(familyOf(parseThemeObject(minimal)))).toEqual(['name', 'contrast', 'variants'])
  })

  it('still refuses a top-level author over 64 characters, as it always did', () => {
    expect(parseThemeObject({ ...minimal, author: 'a'.repeat(65) }).ok).toBe(false)
  })

  it.each([
    [{ created: '2026-02-30' }, 'V12 metadata.created: "2026-02-30" isn’t a day written YYYY-MM-DD, so it was ignored'],
    [{ created: 20261013 }, 'V12 metadata.created: "created" must be text, so it was ignored'],
    [
      { release: '01.0.0' },
      'V12 metadata.release: "01.0.0" isn’t a release written MAJOR.MINOR.PATCH, so it was ignored',
    ],
    [{ author: 'a'.repeat(65) }, 'V12 metadata.author: "author" is limited to 64 characters, so it was ignored'],
    [
      { description: 'd'.repeat(281) },
      'V12 metadata.description: "description" is limited to 280 characters, so it was ignored',
    ],
    [{ licence: 'CC0' }, 'V12 metadata.licence: Unknown key "licence" was ignored'],
    ['Pug', 'V12 metadata: "metadata" must be an object, so it was ignored'],
  ])('warns about %j, drops it, and loads the theme', (metadata, message) => {
    const result = withMetadata(metadata)
    expect(messages(result)).toEqual([message])
    const family = familyOf(result)
    expect([family.author, family.description, family.created, family.release]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('strips control and direction-override characters inside metadata too', () => {
    const bell = String.fromCharCode(7)
    const result = withMetadata({ author: `a${bell}b` })
    expect(familyOf(result).author).toBe('ab')
    expect(messages(result)).toEqual(['V12 metadata.author: Control and direction-override characters were removed'])
  })
})

describe('mode blocks', () => {
  const file = (modes: unknown, extra: object = {}) => ({
    version: 1,
    name: 'Tuned',
    ...extra,
    variants: { light: { colors: { background: '#f3eee4' }, modes } },
  })
  const parsed = (modes: unknown, extra?: object) => {
    const result = parseThemeObject(file(modes, extra))
    if (!result.ok) throw new Error(JSON.stringify(result.issues))
    return result
  }
  const refused = (modes: unknown) => {
    const result = parseThemeObject(file(modes))
    if (result.ok) throw new Error('it parsed')
    return result.issues
  }

  it('reads hand-tuning for each mode, in a variant’s shape', () => {
    const { family, issues } = parsed({
      'high-contrast': { colors: { primary: '#223344' } },
      colourblind: { data: { groups: { failure: '#d55e00' } } },
    })
    expect(issues).toEqual([])
    const modes = family.variants.light?.modes
    expect(modes?.['high-contrast']?.colors.primary).toEqual(parseColor('#223344'))
    expect(modes?.colourblind?.data.groups.failure).toEqual(parseColor('#d55e00'))
  })

  // A block's merge would otherwise turn a variant's `adapt: false` back on.
  it('leaves a block’s adapt unset unless it says so', () => {
    const modes = parsed({ colourblind: { data: {} }, 'high-contrast': { data: { adapt: false } } }).family.variants
      .light?.modes
    expect(modes?.colourblind?.data.adapt).toBeUndefined()
    expect(modes?.['high-contrast']?.data.adapt).toBe(false)
  })

  // familyHash stringifies the family, and an installed theme's id is that hash.
  it('adds no modes key to a variant without any', () => {
    const { family } = parsed(undefined)
    expect(Object.keys(family.variants.light ?? {})).toEqual(['colors', 'data'])
  })

  it('warns about an unknown mode, and a key a block can’t hold', () => {
    const { issues } = parsed({ sepia: {}, colourblind: { modes: {} } })
    expect(issues.map(i => [i.rule, i.path])).toEqual([
      ['V12', 'variants.light.modes.sepia'],
      ['V12', 'variants.light.modes.colourblind.modes'],
    ])
  })

  it('refuses a bad colour inside a block, and says where', () => {
    expect(refused({ 'high-contrast': { colors: { primary: 'nope' } } })).toMatchObject([
      { rule: 'V13', path: 'variants.light.modes.high-contrast.colors.primary' },
    ])
  })

  it('refuses a see-through surface inside a block', () => {
    expect(refused({ colourblind: { colors: { card: 'oklch(0.9 0 0 / 0.5)' } } })).toMatchObject([{ rule: 'V5' }])
  })

  // From raw text: JSON.parse keeps this as an ordinary own key, and zod then drops it unseen.
  it('warns about a __proto__ event inside a block', () => {
    const result = parseThemeText(
      '{"version":1,"name":"T","variants":{"light":{"modes":{"colourblind":{"data":{"events":{"__proto__":"#123456"}}}}}}}',
    )
    expect(result.issues.map(i => i.path)).toEqual(['variants.light.modes.colourblind.data.events.__proto__'])
  })

  // Its standard and high-contrast versions are the same file, so there's nothing for this to tune.
  it('ignores a high-contrast block on a file already marked high contrast', () => {
    const { family, issues } = parsed({ 'high-contrast': { colors: { primary: '#223344' } } }, { contrast: 'high' })
    expect(issues).toMatchObject([{ rule: 'V12', path: 'variants.light.modes.high-contrast' }])
    expect(family.variants.light?.modes?.['high-contrast']).toBeUndefined()
  })

  it('offers modes to editors', () => {
    expect(authoringSchema.safeParse(file({ colourblind: { colors: { primary: '#223344' } } })).success).toBe(true)
    expect(authoringSchema.safeParse(file({ sepia: {} })).success).toBe(false)
  })
})
