import { describe, expect, it } from 'vitest'
import { contrast } from '../lib/color/contrast'
import { deltaE } from '../lib/color/cvd'
import { BUILTINS, builtinRoots } from './builtin'
import { parseThemeObject, type Variant } from './format'
import { dependenciesOf, isRoot } from './registry'
import { RESOLUTION_ORDER, resolveTokens } from './resolve'
import { TOKENS } from './tokens'

const pug = BUILTINS.pug

describe('resolution order', () => {
  it('covers every token once, each after everything it reads', () => {
    expect([...RESOLUTION_ORDER].sort()).toEqual([...TOKENS].sort())
    const position = new Map(RESOLUTION_ORDER.map((t, i) => [t, i]))
    for (const token of TOKENS) {
      for (const dep of dependenciesOf(token))
        expect(position.get(dep), `${dep} before ${token}`).toBeLessThan(position.get(token) as number)
    }
  })
})

describe.each(['light', 'dark'] as const)('resolving %s', polarity => {
  const full = pug.variants[polarity] as Variant

  it('changes nothing about Pug, which lists every token', () => {
    const resolved = resolveTokens(full, polarity, 'standard', builtinRoots(polarity, 'standard'))
    for (const token of TOKENS) {
      expect(resolved.provenance[token]).toBe('explicit')
      expect(resolved.tokens[token]).toEqual(full.colors[token])
    }
  })

  // The formulas' parameters are measured from Pug, so applying them to Pug's roots alone must give
  // Pug back. This checks the solver and the parameter extraction, not generalisation (the sweep in
  // validate.test.ts does that).
  it('reproduces Pug from its roots alone', () => {
    const rootsOnly: Variant = {
      colors: Object.fromEntries(TOKENS.filter(isRoot).map(t => [t, full.colors[t]])),
      data: full.data,
    }
    const resolved = resolveTokens(rootsOnly, polarity, 'standard', builtinRoots(polarity, 'standard'))
    for (const token of TOKENS) {
      if (isRoot(token)) continue
      const a = resolved.tokens[token]
      const b = full.colors[token] as NonNullable<typeof a>
      expect(resolved.provenance[token]).toBe('computed')
      expect(deltaE(a, b) + Math.abs(a.alpha - b.alpha), token).toBeLessThan(0.002)
    }
  })
})

describe('a partial theme', () => {
  const resolve = (colors: Record<string, string>) => {
    const parsed = parseThemeObject({ version: 1, name: 'partial', variants: { light: { colors } } })
    if (!parsed.ok) throw new Error('did not parse')
    return resolveTokens(parsed.family.variants.light, 'light', 'standard', builtinRoots('light', 'standard'))
  }

  it('carries a new primary into link and ring, re-solved as text', () => {
    const { tokens, provenance } = resolve({ primary: 'oklch(0.6 0.2 40)' })
    expect(provenance.link).toBe('computed')
    expect(tokens.link.h).toBeCloseTo(40, 6)
    expect(tokens.ring.h).toBeCloseTo(40, 6)
    expect(contrast(tokens.link, tokens.background)).toBeCloseTo(
      contrast(pug.variants.light?.colors.link as never, pug.variants.light?.colors.background as never),
      2,
    )
  })

  it('builds a surface ladder on a new background', () => {
    const { tokens } = resolve({ background: 'oklch(0.97 0.02 90)' })
    expect(tokens.card.l).toBeGreaterThan(tokens.background.l)
    expect(tokens.sidebar.l).toBeLessThan(tokens.background.l)
    expect(tokens.card.h).toBeCloseTo(90, 6)
  })

  it('falls back to Pug for roots it leaves out', () => {
    const { tokens, provenance } = resolve({ background: 'oklch(0.97 0.02 90)' })
    expect(provenance['chart-1']).toBe('built-in')
    expect(tokens['chart-1']).toEqual(pug.variants.light?.colors['chart-1'])
  })
})
