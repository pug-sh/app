import { expect, it } from 'vitest'
import clay from './__fixtures__/clay.json'
import { compileOnce, compileVariant } from './compile'
import { parseThemeObject } from './format'
import { ACCESS_MODES, STANDARD_ACCESS } from './tokens'

const [, HIGH, , BOTH] = ACCESS_MODES

const parsed = parseThemeObject(clay)
if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
const input = { id: 'clay', builtin: false, family: parsed.family, polarity: 'light' as const }

it('compiles a family once per polarity and mode', () => {
  const standard = compileOnce(input)
  expect(compileOnce({ ...input })).toBe(standard)
  expect(compileOnce({ ...input, access: STANDARD_ACCESS })).toBe(standard)
  expect(compileOnce({ ...input, access: HIGH })).not.toBe(standard)
  expect(compileOnce({ ...input, access: HIGH })).toBe(compileOnce({ ...input, access: HIGH }))
  expect(compileOnce({ ...input, polarity: 'dark' })).not.toBe(standard)
})

it('says which mode it compiled', () => {
  expect(compileVariant({ ...input, access: BOTH })).toMatchObject({ contrast: 'high', vision: 'colourblind' })
  expect(compileVariant(input)).toMatchObject({ contrast: 'standard', vision: 'standard' })
})

// Anything that caches colours keys on the revision, so a mode that repaints has to move it.
it('gives each mode a revision of its own', () => {
  const revisions = ACCESS_MODES.map(access => compileVariant({ ...input, access }).revision)
  expect(new Set(revisions).size).toBe(4)
})
