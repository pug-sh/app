import { describe, expect, it } from 'vitest'
import { contrast } from '../../lib/color/contrast'
import { formatColor } from '../../lib/color/parse'
import { BUILTINS } from '../builtin'
import { compileVariant } from '../compile'
import { parseThemeObject } from '../format'

describe.each(['light', 'dark'] as const)('Pug High Contrast %s', polarity => {
  const high = compileVariant({
    id: 'pug-high-contrast',
    builtin: true,
    family: BUILTINS['pug-high-contrast'],
    polarity,
  })
  const standard = compileVariant({ id: 'pug', builtin: true, family: BUILTINS.pug, polarity })
  const ratio = (c: typeof high, ink: keyof typeof c.tokens, ground: keyof typeof c.tokens) =>
    contrast(c.tokens[ink], c.tokens[ground])

  it('passes every rule at the high floors', () => {
    expect(high.report).toEqual([])
  })

  it('never sits below standard Pug', () => {
    for (const [ink, ground] of [
      ['foreground', 'background'],
      ['muted-foreground', 'background'],
      ['faint', 'background'],
      ['link', 'background'],
    ] as const) {
      expect(ratio(high, ink, ground), ink).toBeGreaterThanOrEqual(ratio(standard, ink, ground))
    }
  })

  // The spec's high-contrast levels are APCA Lc 90 / 75 / 60 — about 12:1, 7:1 and 4.5:1 in WCAG
  // terms. Clearing them on the lightest ground each ink lands on is what makes HC visibly stronger
  // than Pug, rather than Pug on a different canvas.
  it('reaches the spec’s contrast levels on every ground', () => {
    expect(ratio(high, 'foreground', 'popover')).toBeGreaterThanOrEqual(12)
    expect(ratio(high, 'muted-foreground', 'muted')).toBeGreaterThanOrEqual(7)
    expect(ratio(high, 'faint', 'popover')).toBeGreaterThanOrEqual(4.5)
  })

  it('computes everything but its roots', () => {
    expect(high.provenance.foreground).toBe('computed')
    expect(high.provenance.background).toBe('explicit')
  })
})

it('gives a partial high-contrast theme high-contrast tokens on any plausible canvas', () => {
  const failures: string[] = []
  for (const polarity of ['light', 'dark'] as const) {
    for (const l of polarity === 'dark' ? [0.08, 0.12, 0.16, 0.2] : [0.95, 0.975, 1]) {
      for (const h of [0, 90, 180, 270]) {
        const background = formatColor({ l, c: 0.02, h, alpha: 1 })
        const parsed = parseThemeObject({
          version: 1,
          name: 'x',
          contrast: 'high',
          variants: { [polarity]: { colors: { background } } },
        })
        if (!parsed.ok) throw new Error('did not parse')
        const report = compileVariant({ id: 'x', builtin: false, family: parsed.family, polarity }).report
        failures.push(...report.map(i => `${polarity} ${background}: ${i.message}`))
      }
    }
  }
  expect(failures).toEqual([])
})
