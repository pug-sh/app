import { describe, expect, it } from 'vitest'
import { formatColor, parseColor } from '../../lib/color/parse'
import heat from '../__fixtures__/heat.json'
import tokens from '../__fixtures__/tokens.json'
import { PUG_CANVAS } from '../fit'
import { parseThemeObject } from '../format'
import { TOKENS, type TokenName } from '../tokens'
import { PUG_AUTH_SURFACE, pug } from './pug'

const canonical = (value: string) => {
  const parsed = parseColor(value)
  if (!parsed) throw new Error(`not a colour: ${value}`)
  return formatColor(parsed)
}

const parsed = parseThemeObject(pug)
if (!parsed.ok) throw new Error('the Pug preset does not parse')
const family = parsed.family

// Golden: the preset holds exactly what index.css, name-chip.tsx and retention-cohort.tsx held
// before the refactor.
describe.each(['light', 'dark'] as const)('Pug %s', polarity => {
  const colors = family.variants[polarity]?.colors ?? {}
  const value = (token: TokenName) => formatColor(colors[token] as NonNullable<(typeof colors)[TokenName]>)

  it('parses with no issues and lists every token', () => {
    expect(parsed.issues).toEqual([])
    for (const token of TOKENS) expect(colors[token], token).toBeDefined()
  })

  it('matches every token index.css declared', () => {
    for (const [token, css] of Object.entries(tokens[polarity]))
      expect(value(token as TokenName), token).toBe(canonical(css))
  })

  it('matches the syntax, name-chip and heatmap colours', () => {
    expect(value('syntax-keyword')).toBe(canonical(tokens.syntax[polarity].keyword))
    expect(value('syntax-string')).toBe(canonical(tokens.syntax[polarity].string))
    expect(value('syntax-class')).toBe(canonical(tokens.syntax[polarity].class))
    expect(value('identity-surface')).toBe(canonical(tokens.identity[polarity].surface))
    expect(value('identity-ink')).toBe(canonical(tokens.identity[polarity].ink))
    heat.forEach((stop, i) => {
      expect(value(`heat-${i + 1}` as TokenName)).toBe(canonical(stop.fill))
      expect(value(`heat-${i + 1}-ink` as TokenName)).toBe(canonical(stop.ink))
    })
  })

  it('agrees with the canvas the fit is anchored to', () => {
    expect(value('background')).toBe(formatColor(PUG_CANVAS[polarity]))
  })
})

it('keeps the sign-in surface index.css re-solved', () => {
  const fromPreset = Object.fromEntries(Object.entries(PUG_AUTH_SURFACE).map(([k, v]) => [k, canonical(v as string)]))
  const fromCss = Object.fromEntries(Object.entries(tokens.authSurface).map(([k, v]) => [k, canonical(v)]))
  expect(fromPreset).toEqual(fromCss)
})
