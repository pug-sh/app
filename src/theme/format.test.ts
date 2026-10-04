import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { authoringSchema, MAX_THEME_BYTES, parseThemeObject, parseThemeText } from './format'

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

  it('never copies an unknown key onto anything — __proto__ is just another unknown token', () => {
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
    const result = parseThemeObject({ ...minimal, name: 'Pug‮ (official)', author: 'a\u0007b' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.family.name).toBe('Pug (official)')
    expect(result.family.author).toBe('ab')
    expect(result.issues.filter(i => i.rule === 'V12')).toHaveLength(2)
  })

  it('keys event colours by their canonical kind', () => {
    const result = parseThemeObject({ ...minimal, variants: { dark: { data: { events: { pageView: '#8be9fd' } } } } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.family.variants.dark?.data.events ?? {})).toEqual(['page_view'])
  })
})

describe('authoringSchema', () => {
  it('exports a strict JSON Schema that lists every token for autocomplete', () => {
    const schema = JSON.stringify(z.toJSONSchema(authoringSchema))
    expect(schema).toContain('"sidebar-accent-foreground"')
    expect(schema).toContain('"failure"')
    expect(schema).toContain('"additionalProperties":false')
  })
})
