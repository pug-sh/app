import { describe, expect, it } from 'vitest'
import { toHex } from '../../lib/color/oklch'
import frozen from '../__fixtures__/pug-modes.json'
import { BUILTINS, builtinRoots } from '../builtin'
import { compileVariant, hashString } from '../compile'
import { FALLBACK_COLORS } from '../data-palette'
import { fitFor } from '../fit'
import { ACCESS_MODES, type AccessMode, type Polarity } from '../tokens'

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

  it('still compiles Pug High Contrast to what it was', () => {
    const family = BUILTINS['pug-high-contrast']
    const { vars, data } = compileVariant({ id: 'pug-high-contrast', builtin: true, family, polarity })
    expect(vars).toEqual(frozen['high-contrast'][polarity].vars)
    expect(hashString(JSON.stringify(data))).toBe(frozen['high-contrast'][polarity].data)
  })

  it('still compiles Pug Colourblind-safe to what it was', () => {
    const family = BUILTINS['pug-colourblind']
    const { vars, data } = compileVariant({ id: 'pug-colourblind', builtin: true, family, polarity })
    expect(vars).toEqual(frozen.colourblind[polarity].vars)
    expect(hashString(JSON.stringify(data))).toBe(frozen.colourblind[polarity].data)
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
