import { describe, expect, it } from 'vitest'
import { deltaE, worstDeltaE } from '../../lib/color/cvd'
import { fromHex } from '../../lib/color/oklch'
import { BUILTINS } from '../builtin'
import { compileVariant } from '../compile'
import { groupOf } from '../data-palette'

// Acceptance (spec §6): in each mode, under protan, deutan and tritan simulation, every categorical
// pair stays ≥ 0.05 apart and every failure × success pair ≥ 0.15 — measured on the colours as drawn.
describe.each(['light', 'dark'] as const)('Pug Colourblind-safe %s', polarity => {
  const compiled = compileVariant({
    id: 'pug-colourblind',
    builtin: true,
    family: BUILTINS['pug-colourblind'],
    polarity,
  })

  it('passes every rule', () => {
    expect(compiled.report).toEqual([])
  })

  it('keeps every breakdown pair apart under each deficiency', () => {
    const colours = compiled.data.categorical.map(c => fromHex(c.line))
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
      Object.entries(compiled.data.events)
        .filter(([e]) => groupOf(e) === group)
        .map(([, c]) => fromHex(c.line))
    for (const a of members('failure'))
      for (const b of members('success')) expect(worstDeltaE(a, b)).toBeGreaterThanOrEqual(0.15)
  })

  it('leaves the UI exactly as Pug draws it', () => {
    const pug = compileVariant({ id: 'pug', builtin: true, family: BUILTINS.pug, polarity })
    expect(compiled.vars).toEqual(pug.vars)
  })
})
