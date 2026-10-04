import { describe, expect, it } from 'vitest'
import { formatColor } from '../lib/color/parse'
import { BUILTINS } from './builtin'
import { compileVariant } from './compile'
import { parseThemeObject, type ThemeFile } from './format'
import type { Polarity } from './tokens'
import { FLOORS, measureFloors } from './validate'

const compileFile = (file: ThemeFile, polarity: Polarity) => {
  const parsed = parseThemeObject(file)
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return compileVariant({ id: 'test', builtin: false, family: parsed.family, polarity })
}

const rules = (file: ThemeFile, polarity: Polarity = 'light') => compileFile(file, polarity).report.map(i => i.rule)

const theme = (
  colors: Record<string, string>,
  extra: Partial<ThemeFile> = {},
  polarity: Polarity = 'light',
): ThemeFile => ({
  version: 1,
  name: 'test',
  ...extra,
  variants: { [polarity]: { colors } },
})

describe.each(['light', 'dark'] as const)('Pug %s', polarity => {
  const compiled = compileVariant({ id: 'pug', builtin: true, family: BUILTINS.pug, polarity })

  it('passes every rule', () => {
    expect(compiled.report).toEqual([])
  })

  it('still produces the pinned floors', () => {
    expect(measureFloors({ tokens: compiled.tokens, data: compiled.data, polarity, contrast: 'standard' })).toEqual(
      FLOORS[polarity],
    )
  })
})

describe('each rule fires', () => {
  it.each([
    ['V1', theme({ background: '#ffffff' }, {}, 'dark'), 'dark'],
    ['V2', theme({ foreground: '#bbbbbb' }), 'light'],
    ['V3', theme({ primary: '#3fa34d', 'primary-foreground': '#ffffff' }), 'light'],
    ['V4', theme({ card: 'oklch(0.9 0.005 265)' }), 'light'],
    ['V5', theme({ input: 'oklch(0.876 0.006 265 / 0.5)' }), 'light'],
    ['V6', theme({ 'secondary-foreground': '#000000' }), 'light'],
    [
      'V7',
      { version: 1, name: 't', variants: { light: { data: { adapt: false, events: { page_view: '#f0f0f0' } } } } },
      'light',
    ],
    ['V8', { version: 1, name: 't', variants: { light: { data: { avatars: ['#202020'] } } } }, 'light'],
    ['V9', theme({ 'identity-ink': 'oklch(0.93 0.035 0)' }), 'light'],
    ['V10', theme({ 'heat-4-ink': '#16a34a' }), 'light'],
    ['V11', theme({ border: 'oklch(0.97 0 0)' }, { contrast: 'high' }), 'light'],
  ] as const)('%s', (rule, file, polarity) => {
    expect(rules(file as ThemeFile, polarity)).toContain(rule)
  })
})

// Generalisation: a theme that sets only a canvas (and maybe a primary) gets a coherent result on any
// plausible canvas — dark from 0.12 to Nord-light 0.36, light from 0.9 to white.
describe('partial themes across canvases', () => {
  const grids: Record<Polarity, number[]> = {
    dark: [0.12, 0.16, 0.2, 0.24, 0.28, 0.32, 0.36],
    light: [0.9, 0.925, 0.95, 0.975, 1],
  }
  const cases = (['light', 'dark'] as const).flatMap(polarity =>
    grids[polarity].flatMap(l =>
      [0, 60, 120, 180, 240, 300].flatMap(h =>
        [0, 0.02, 0.04].flatMap(c =>
          [undefined, `oklch(0.55 0.18 ${h})`].map(primary => ({ polarity, l, h, c, primary })),
        ),
      ),
    ),
  )

  it(`has zero warnings for all ${cases.length} combinations`, () => {
    const failures = cases.flatMap(({ polarity, l, h, c, primary }) => {
      const colors: Record<string, string> = { background: formatColor({ l, c, h, alpha: 1 }) }
      if (primary) colors.primary = primary
      return compileFile(theme(colors, {}, polarity), polarity).report.map(
        i => `${polarity} ${colors.background}: ${i.message}`,
      )
    })
    expect(failures).toEqual([])
  })
})
