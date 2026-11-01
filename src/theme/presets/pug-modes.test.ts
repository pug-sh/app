import { describe, expect, it } from 'vitest'
import { contrast } from '../../lib/color/contrast'
import { deltaE, worstDeltaE } from '../../lib/color/cvd'
import { fromHex, toHex } from '../../lib/color/oklch'
import { formatColor } from '../../lib/color/parse'
import frozen from '../__fixtures__/pug-modes.json'
import { BUILTINS, builtinRoots } from '../builtin'
import { compileVariant, hashString } from '../compile'
import { FALLBACK_COLORS, groupOf } from '../data-palette'
import { fitFor } from '../fit'
import { parseThemeObject } from '../format'
import { ACCESS_MODES, type AccessMode, type Polarity, STANDARD_ACCESS } from '../tokens'

const [, HIGH, BLIND, BOTH] = ACCESS_MODES

const compileIn = (polarity: Polarity, access: AccessMode) =>
  compileVariant({ id: 'pug', builtin: true, family: BUILTINS.pug, polarity, access })

// pug-modes.json is what Pug High Contrast and Pug Colourblind-safe compiled to while they were themes of their own.
// Frozen once, never regenerated: a deliberate retune changes the preset and this expectation in the same commit.
describe.each(['light', 'dark'] as const)('Pug’s modes, %s', polarity => {
  const blocks = BUILTINS.pug.variants[polarity]?.modes

  it('hands out the high-contrast block as the roots of that level', () => {
    expect(blocks?.['high-contrast']).toBeDefined()
    expect(builtinRoots(polarity, 'high')).toBe(blocks?.['high-contrast']?.colors)
  })

  it('high contrast is today’s Pug High Contrast', () => {
    const { vars, data } = compileIn(polarity, ACCESS_MODES[1])
    expect(vars).toEqual(frozen['high-contrast'][polarity].vars)
    expect(hashString(JSON.stringify(data))).toBe(frozen['high-contrast'][polarity].data)
  })

  // Spec correction 6: its data colours stay exact, and exactly these five change.
  it('colourblind keeps today’s data colours, and moves only the status colours', () => {
    const { vars, data } = compileIn(polarity, ACCESS_MODES[2])
    expect(hashString(JSON.stringify(data))).toBe(frozen.colourblind[polarity].data)
    const before = frozen.colourblind[polarity].vars
    const moved = Object.entries(vars).filter(([name, value]) => value !== before[name as keyof typeof before])
    expect(moved.map(([name]) => name).sort()).toEqual([
      '--caution',
      '--negative',
      '--positive',
      '--success',
      '--warning',
    ])
  })

  it.each(ACCESS_MODES)('passes every rule, $contrast contrast, $vision vision', access => {
    expect(compileIn(polarity, access).report).toEqual([])
  })

  it('fits its high-contrast breakdown list to that mode’s own canvas', () => {
    const canvas = builtinRoots(polarity, 'high').background
    expect(blocks?.['high-contrast']?.data.categorical?.map(toHex)).toEqual(
      FALLBACK_COLORS.map(fitFor(polarity, 'high', canvas)),
    )
  })
})

describe.each(['light', 'dark'] as const)('Pug in high contrast, %s', polarity => {
  const high = compileIn(polarity, HIGH)
  const standard = compileIn(polarity, STANDARD_ACCESS)
  const ratio = (c: typeof high, ink: keyof typeof c.tokens, ground: keyof typeof c.tokens) =>
    contrast(c.tokens[ink], c.tokens[ground])

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

  // The spec's high-contrast levels are APCA Lc 90 / 75 / 60, about 12:1, 7:1 and 4.5:1 in WCAG
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

// Acceptance: in each mode, under protan, deutan and tritan simulation, every categorical
// pair stays ≥ 0.05 apart and every failure × success pair ≥ 0.15, measured on the colours as drawn.
describe.each([
  ['light', 'alone', BLIND],
  ['dark', 'alone', BLIND],
  ['light', 'with high contrast', BOTH],
  ['dark', 'with high contrast', BOTH],
] as const)('Pug colourblind-safe, %s, %s', (polarity, _, access) => {
  const { data } = compileIn(polarity, access)

  it('keeps every breakdown pair apart under each deficiency', () => {
    const colours = data.categorical.map(c => fromHex(c.line))
    for (let i = 0; i < colours.length; i++) {
      for (let j = i + 1; j < colours.length; j++) {
        for (const kind of ['protan', 'deutan', 'tritan'] as const) {
          expect(deltaE(colours[i], colours[j], kind), `${i}/${j} ${kind}`).toBeGreaterThanOrEqual(0.05)
        }
      }
    }
  })

  it('keeps failure and success apart for every member pair', () => {
    const members = (group: 'failure' | 'success') =>
      Object.entries(data.events)
        .filter(([e]) => groupOf(e) === group)
        .map(([, c]) => fromHex(c.line))
    for (const a of members('failure'))
      for (const b of members('success')) expect(worstDeltaE(a, b)).toBeGreaterThanOrEqual(0.15)
  })
})
