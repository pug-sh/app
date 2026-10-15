// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as kit from './kit'

// The kit is bundled for Bun and run outside any browser, so this file runs without a DOM: an import that
// reaches for window or document at module scope fails here first.
describe('the theme kit', () => {
  it('runs without a DOM', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
  })

  it('checks a theme file with this build’s rules', () => {
    const file = {
      version: 1,
      name: 'Clay',
      metadata: { release: '1.0.0' },
      variants: { light: { colors: { background: '#f3eee4' } } },
    }
    expect(kit.checkThemeText(JSON.stringify(file))).toMatchObject({ ok: true, issues: [] })
    expect(kit.checkThemeText('{"version":1,"name":"Broken","variants":{}}').ok).toBe(false)
  })

  it('carries the rules the repository orders and checks releases by', () => {
    expect(kit.parseRelease('1.4.1')).toEqual({ major: 1, minor: 4, patch: 1 })
    expect(kit.isSlug('schema')).toBe(false)
    expect(kit.SCHEMA_URL).toBe('https://themes.pug.sh/schema/v1.json')
    expect(kit.MAX_THEME_BYTES).toBe(65536)
  })
})
