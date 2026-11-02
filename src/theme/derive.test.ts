import { describe, expect, it } from 'vitest'
import { contrast } from '../lib/color/contrast'
import { worstDeltaE } from '../lib/color/cvd'
import type { Oklch } from '../lib/color/oklch'
import { formatColor, parseColor } from '../lib/color/parse'
import clay from './__fixtures__/clay.json'
import frozen from './__fixtures__/pug-modes.json'
import { BUILTINS, builtinRoots } from './builtin'
import { modeInputs, statusHue } from './derive'
import { parseThemeObject, type ThemeFamily } from './format'
import { resolveTokens } from './resolve'
import { solveFitted } from './solve'
import { ACCESS_MODES, type AccessMode, type Polarity, STANDARD_ACCESS } from './tokens'
import { FLOORS } from './validate'

const [, HIGH, BLIND, BOTH] = ACCESS_MODES

const family = (file: unknown) => {
  const parsed = parseThemeObject(file)
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.family
}
const theme = (polarity: Polarity, colors: object, more: object = {}) =>
  family({ version: 1, name: 't', variants: { [polarity]: { colors, ...more } } })
const clayFamily = family(clay)
const tokensIn = (of: ThemeFamily, polarity: Polarity, access: AccessMode) => {
  const { colors, level } = modeInputs(of, polarity, access)
  return resolveTokens({ colors }, polarity, level, builtinRoots(polarity, level)).tokens
}
// How far caution sits from its closest neighbour, where it landed and where its search began.
const cautionSpread = (of: ThemeFamily, polarity: Polarity) => {
  const standard = tokensIn(of, polarity, STANDARD_ACCESS)
  const blind = tokensIn(of, polarity, BLIND)
  const closest = (ink: Oklch) =>
    Math.min(worstDeltaE(ink, blind.positive), worstDeltaE(ink, blind.negative), worstDeltaE(ink, blind.foreground))
  const floor = contrast(standard.caution, standard.background)
  const start = solveFitted(blind.background, polarity, floor, blind.caution.c, blind.caution.h)
  return { landed: closest(blind.caution), started: closest(start) }
}
const POLARITIES = ['light', 'dark'] as const
const THEMES = [
  ['Clay', clayFamily],
  ['Pug', BUILTINS.pug],
] as const

it('leaves the standard mode exactly as it was', () => {
  const inputs = modeInputs(clayFamily, 'light', STANDARD_ACCESS)
  expect(inputs.colors).toBe(clayFamily.variants.light?.colors)
  expect(inputs.data).toBe(clayFamily.variants.light?.data)
  expect(inputs.level).toBe('standard')
})

describe('high contrast', () => {
  it.each([
    ['light', 'background', 1, 0, null],
    ['light', 'primary', 0.45, 0.119, 50],
    ['light', 'destructive', 0.44, 0.176, 15],
    ['light', 'link', 0.444, 0.118, 50],
    ['light', 'negative', 0.401, 0.15, 5],
    ['light', 'caution', 0.402, 0.082, 85],
    ['dark', 'background', 0.13, 0.004, 55],
    ['dark', 'primary', 0.82, 0.11, 50],
    ['dark', 'destructive', 0.78, 0.13, 15],
    ['dark', 'link', 0.725, 0.11, 50],
    ['dark', 'negative', 0.729, 0.1, 5],
    ['dark', 'caution', 0.717, 0.08, 85],
  ] as const)('puts Clay %s on Pug High Contrast’s grounds, in its own hues: %s', (polarity, token, l, c, h) => {
    const color = tokensIn(clayFamily, polarity, HIGH)[token]
    expect(color.l).toBeCloseTo(l, 3)
    expect(color.c).toBeCloseTo(c, 3)
    if (h !== null) expect(color.h).toBeCloseTo(h, 0)
  })

  describe.each(POLARITIES)('%s', polarity => {
    const standard = tokensIn(clayFamily, polarity, STANDARD_ACCESS)
    const high = tokensIn(clayFamily, polarity, HIGH)

    it.each(['link', 'negative', 'caution'] as const)('never sits below the theme’s own contrast: %s', token => {
      const own = contrast(standard[token], standard.background)
      expect(contrast(high[token], high.background)).toBeGreaterThanOrEqual(own * 1.15 - 0.01)
    })

    it('gives a colour the theme left out Pug High Contrast’s value', () => {
      expect(high.success).toEqual(builtinRoots(polarity, 'high').success)
    })
  })

  it('keeps the crosshair at Pug High Contrast’s lightness, in the theme’s hue', () => {
    const { 'chart-crosshair': crosshair } = tokensIn(clayFamily, 'light', HIGH)
    expect(crosshair).toMatchObject({ l: 0.25, c: 0.05, h: 50 })
  })

  // A status fill carries no V3 pair: only the two filled controls move for their ink.
  it('leaves status fills at Pug High Contrast’s lightness', () => {
    const of = theme('light', { success: 'oklch(0.6 0.1 143)', warning: 'oklch(0.7 0.1 143)' })
    const { success, warning } = tokensIn(of, 'light', HIGH)
    expect(success.l).toBe(0.5)
    expect(warning.l).toBe(0.62)
  })

  it('drops a surface the theme set', () => {
    const high = tokensIn(theme('light', { card: 'oklch(0.9 0.02 80)' }), 'light', HIGH)
    expect(formatColor(high.card)).toBe(frozen['high-contrast'].light.vars['--card'])
  })

  it('keeps Pug’s hue for a grey canvas, rather than a red cast', () => {
    expect(tokensIn(theme('dark', { background: 'oklch(0.2 0 0)' }), 'dark', HIGH).background.h).toBe(265)
  })

  it('re-solves a chart colour against the new paper', () => {
    const high = tokensIn(theme('light', { 'chart-1': 'oklch(0.72 0.18 30)' }), 'light', HIGH)
    expect(contrast(high['chart-1'], high.background)).toBeGreaterThanOrEqual(3.3)
    expect(high['chart-1'].h).toBeCloseTo(30, 0)
  })

  it('moves a ramp with the paper, in order', () => {
    const heat = { 'heat-1': 0.85, 'heat-2': 0.77, 'heat-3': 0.69, 'heat-4': 0.61, 'heat-5': 0.53, 'heat-6': 0.45 }
    const colors = Object.fromEntries(Object.entries(heat).map(([token, l]) => [token, `oklch(${l} 0.05 140)`]))
    const of = theme('dark', { background: 'oklch(0.22 0.018 55)', ...colors, 'heat-7': 'oklch(0.37 0.05 140)' })
    const high = tokensIn(of, 'dark', HIGH)
    for (const [token, l] of Object.entries(heat)) {
      expect(high[token as keyof typeof heat].l).toBeCloseTo(l - (0.22 - 0.13), 3)
    }
    expect(high['heat-7'].l).toBeCloseTo(0.28, 3)
  })

  it('takes a hand-tuned value over the computed one', () => {
    const of = theme(
      'light',
      { primary: 'oklch(0.55 0.13 50)' },
      { modes: { 'high-contrast': { colors: { primary: '#223344' } } } },
    )
    expect(tokensIn(of, 'light', HIGH).primary).toEqual(parseColor('#223344'))
  })

  // A block's data merges over the variant's, and a block that says nothing about adapt says nothing about adapt.
  it('keeps a variant’s adapt unless a block states one', () => {
    const adapt = (block: object) =>
      modeInputs(theme('light', {}, { data: { adapt: false }, modes: { 'high-contrast': block } }), 'light', HIGH).data
        ?.adapt
    expect(adapt({ data: {} })).toBe(false)
    expect(adapt({ data: { adapt: true } })).toBe(true)
  })

  it('treats a value equal to Pug’s as unset', () => {
    const high = tokensIn(theme('light', { primary: 'oklch(0.55 0.18 265)' }), 'light', HIGH)
    expect(high.primary).toMatchObject({ l: 0.45, c: 0.2, h: 265 })
  })

  it('lets a fill pass Pug High Contrast’s lightness only as far as 7:1 needs', () => {
    const green = tokensIn(theme('light', { primary: 'oklch(0.55 0.18 143)' }), 'light', HIGH)
    expect(contrast(green['primary-foreground'], green.primary)).toBeGreaterThanOrEqual(7)
    expect(green.primary.l).toBeLessThan(0.45)
    expect(green.primary.l).toBeGreaterThan(0.43)
    const clear = tokensIn(theme('light', { primary: 'oklch(0.55 0.18 50)' }), 'light', HIGH)
    expect(clear.primary.l).toBeCloseTo(0.45, 3)
  })
})

describe('colourblind-safe', () => {
  it('steps Clay’s errors around its link', () => {
    expect(tokensIn(clayFamily, 'light', BLIND).negative.h).toBeCloseTo(346.3, 0)
  })

  it('steps Pug’s good around its link', () => {
    expect(tokensIn(BUILTINS.pug, 'light', BLIND).positive.h).toBeCloseTo(165.5, 0)
  })

  it.each(Array.from({ length: 48 }, (_, i) => i * 7.5))('keeps good and bad clear of a link at hue %s', h => {
    const link = { l: 0.47, c: 0.12, h, alpha: 1 }
    const gap = (a: number) => Math.min(Math.abs(a - h) % 360, 360 - (Math.abs(a - h) % 360))
    expect(gap(statusHue('good', link))).toBeGreaterThan(30)
    expect(gap(statusHue('bad', link))).toBeGreaterThan(30)
  })

  it('ignores a link with almost no chroma', () => {
    expect(statusHue('good', { l: 0.47, c: 0.03, h: 244, alpha: 1 })).toBeCloseTo(244, 0)
  })

  describe.each(THEMES)('%s', (_, of) => {
    describe.each(POLARITIES)('%s', polarity => {
      const standard = tokensIn(of, polarity, STANDARD_ACCESS)
      const blind = tokensIn(of, polarity, BLIND)

      it.each(['positive', 'negative', 'caution'] as const)(
        'keeps %s between its standard contrast and body text',
        token => {
          const own = contrast(standard[token], standard.background)
          expect(contrast(blind[token], blind.background)).toBeGreaterThanOrEqual(own - 0.01)
          const reach = (l: number) => Math.abs(l - blind.background.l)
          expect(reach(blind[token].l)).toBeLessThanOrEqual(reach(blind.foreground.l) + 1e-9)
        },
      )

      it('leaves destructive and the link alone', () => {
        expect(blind.destructive).toEqual(standard.destructive)
        expect(blind.link).toEqual(standard.link)
      })

      it('takes the chosen hue to the badge fills', () => {
        expect(blind.success.h).toBe(blind.positive.h)
        expect(blind.warning.h).toBe(blind.caution.h)
        expect(blind.success.l).toBe(standard.success.l)
        expect(blind.warning.l).toBe(standard.warning.l)
      })

      // Caution comes after good against bad, and takes whichever stop leaves its closest neighbour furthest away.
      it('never leaves caution closer to a neighbour than where it started', () => {
        const { landed, started } = cautionSpread(of, polarity)
        expect(landed).toBeGreaterThanOrEqual(started)
      })

      it.each([
        ['alone', BLIND],
        ['with high contrast', BOTH],
      ])('puts good and bad apart %s', (__, access) => {
        const { positive, negative } = tokensIn(of, polarity, access)
        expect(worstDeltaE(positive, negative)).toBeGreaterThan(0.08)
      })
    })
  })

  it.each(POLARITIES)('moves Pug’s caution off its start when that’s further from a neighbour, %s', polarity => {
    const { landed, started } = cautionSpread(BUILTINS.pug, polarity)
    expect(landed).toBeGreaterThan(started)
  })

  it('gives grey status colours real chroma', () => {
    const of = theme('dark', {
      background: 'oklch(0.16 0.012 305)',
      positive: 'oklch(0.785 0.02 137)',
      negative: 'oklch(0.8 0.02 29)',
      caution: 'oklch(0.79 0.02 80)',
    })
    const { positive, negative } = tokensIn(of, 'dark', BLIND)
    expect(worstDeltaE(positive, negative)).toBeGreaterThan(0.05)
  })

  it('gives outcome events Pug Colourblind-safe’s anchors whatever the link', () => {
    const { data } = modeInputs(clayFamily, 'light', BLIND)
    expect(data?.groups.failure).toEqual(parseColor('#d55e00'))
    expect(data?.groups.success).toEqual(parseColor('#0072b2'))
  })

  it('drops a theme’s own outcome colours and keeps the rest', () => {
    const of = theme(
      'light',
      {},
      { data: { events: { payment_failed: '#ff0000', page_view: '#00ff00', my_custom_event: '#0000ff' } } },
    )
    const { data } = modeInputs(of, 'light', BLIND)
    expect(Object.keys(data?.events ?? {}).sort()).toEqual(['my_custom_event', 'page_view'])
  })

  it('leaves a breakdown colour alone unless it falls short', () => {
    const list = BUILTINS.pug.variants.light?.modes?.colourblind?.data.categorical
    expect(modeInputs(theme('light', {}), 'light', BLIND).data?.categorical).toEqual(list)

    const of = theme('dark', { background: 'oklch(0.36 0.02 180)' })
    const paper = tokensIn(of, 'dark', BLIND).background
    for (const color of modeInputs(of, 'dark', BLIND).data?.categorical ?? []) {
      expect(contrast(color, paper)).toBeGreaterThanOrEqual(FLOORS.dark.data)
    }
  })

  it('takes a hand-tuned status colour as it stands', () => {
    const of = theme('light', {}, { modes: { colourblind: { colors: { positive: '#0a5' } } } })
    expect(tokensIn(of, 'light', BLIND).positive).toEqual(parseColor('#0a5'))
  })

  it('searches around a hand-tuned colour, so bad moves away from a good the author fixed', () => {
    const of = theme('dark', {}, { modes: { colourblind: { colors: { positive: 'oklch(0.72 0.1 47.5)' } } } })
    const { positive, negative } = tokensIn(of, 'dark', BLIND)
    expect(worstDeltaE(positive, negative)).toBeGreaterThan(0.05)
  })
})

describe('both at once', () => {
  const blind = tokensIn(clayFamily, 'light', BLIND)
  const both = tokensIn(clayFamily, 'light', BOTH)

  it.each(['positive', 'negative', 'caution'] as const)('solves %s to the high-contrast targets', token => {
    expect(contrast(both[token], both.background)).toBeGreaterThanOrEqual(8)
    expect(both[token].h).toBe(blind[token].h)
  })

  it('carries a hand-tuned hue across, and re-solves its lightness', () => {
    const of = theme('light', {}, { modes: { colourblind: { colors: { positive: 'oklch(0.4 0.1 200)' } } } })
    const { positive, background } = tokensIn(of, 'light', BOTH)
    expect(positive.h).toBeCloseTo(200, 0)
    expect(positive.l).not.toBeCloseTo(0.4, 3)
    expect(contrast(positive, background)).toBeGreaterThanOrEqual(8)
  })

  it('drops a colourblind block’s other colours', () => {
    const of = theme('light', {}, { modes: { colourblind: { colors: { primary: '#223344' } } } })
    expect(tokensIn(of, 'light', BLIND).primary).toEqual(parseColor('#223344'))
    expect(tokensIn(of, 'light', BOTH).primary).not.toEqual(parseColor('#223344'))
  })
})

describe('a file marked high contrast', () => {
  const of = family({
    version: 1,
    name: 'Night',
    contrast: 'high',
    variants: { light: { colors: { background: '#ffffff', link: 'oklch(0.4 0.12 300)' } } },
  })

  it('treats high contrast as its own standard', () => {
    expect(modeInputs(of, 'light', HIGH).colors).toBe(of.variants.light?.colors)
    expect(modeInputs(of, 'light', HIGH).level).toBe('high')
    expect(modeInputs(of, 'light', STANDARD_ACCESS).level).toBe('high')
  })

  it('still applies colourblind-safe on top', () => {
    expect(tokensIn(of, 'light', BLIND).positive.h).not.toBe(tokensIn(of, 'light', STANDARD_ACCESS).positive.h)
  })
})

it.each(POLARITIES)('reads Pug’s high contrast straight from its block, %s', polarity => {
  expect(modeInputs(BUILTINS.pug, polarity, HIGH).colors).toEqual(
    BUILTINS.pug.variants[polarity]?.modes?.['high-contrast']?.colors,
  )
})
