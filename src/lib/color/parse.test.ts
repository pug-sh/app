import { describe, expect, it } from 'vitest'
import { fromHex, toHex } from './oklch'
import { CANONICAL_COLOR_RE, formatColor, parseColor } from './parse'

const canonical = (input: string) => {
  const parsed = parseColor(input)
  return parsed && formatColor(parsed)
}

describe('parseColor', () => {
  it.each([
    ['oklch(0.943 0.005 265)', 'oklch(0.943 0.005 265)'],
    ['oklch(0.68 0.022 265 / 0.22)', 'oklch(0.68 0.022 265 / 0.22)'],
    ['oklch(0.4 0.1828 274.34)', 'oklch(0.4 0.1828 274.34)'],
    ['oklch(50% 50% 120deg)', 'oklch(0.5 0.2 120)'],
    ['oklch(0.5 0 300)', 'oklch(0.5 0 0)'],
  ])('writes %s as %s', (input, expected) => {
    expect(canonical(input)).toBe(expected)
  })

  // The canonical form carries six decimals so a hex-authored value lands on the same sRGB bytes.
  it.each(['#dcfce7', '#86efac', '#16a34a', '#14532d', '#f8fafc', '#da8282', '#3b6cf0', '#000000', '#ffffff'])(
    'round-trips %s byte for byte',
    hex => {
      const written = canonical(hex) as string
      expect(written).toMatch(CANONICAL_COLOR_RE)
      expect(toHex(parseColor(written) as NonNullable<ReturnType<typeof parseColor>>)).toBe(hex)
    },
  )

  it('reads the rgb and hsl forms', () => {
    expect(parseColor('rgba(255, 0, 0, 0.5)')?.alpha).toBe(0.5)
    expect(toHex(parseColor('rgb(0 128 0)') as NonNullable<ReturnType<typeof parseColor>>)).toBe('#008000')
    expect(toHex(parseColor('hsl(0 100% 50%)') as NonNullable<ReturnType<typeof parseColor>>)).toBe('#ff0000')
    expect(toHex(parseColor('hsla(120, 100%, 20%, 1)') as NonNullable<ReturnType<typeof parseColor>>)).toBe('#006600')
  })

  // A grammar, not a denylist: anything that could carry CSS of its own simply fails to match.
  it.each([
    'red',
    'var(--x)',
    'url(https://example.com/x.png)',
    'oklch(0.5 0.1 200); } body { display: none',
    'calc(1px + 1px)',
    'color-mix(in oklab, red, blue)',
    'oklch(from red l c h)',
    'oklch(none 0.1 20)',
    'oklch(0.5 -0.1 20)',
    '#ggg',
    'rgb(1 2 3) x',
    'x'.repeat(65),
  ])('rejects %s', input => {
    expect(parseColor(input)).toBeNull()
  })
})

// Any chroma reads as valid CSS, so a theme can say 10000000. Uncapped it serialised in exponent
// notation — which the first-paint script rightly refuses — and the gamut fit ran out of steps and
// drew it grey where the browser draws it vivid.
it('caps chroma at what no display can show', () => {
  const huge = parseColor('oklch(0.6 10000000 30)') as NonNullable<ReturnType<typeof parseColor>>
  expect(huge.c).toBe(0.5)
  expect(formatColor(huge)).toMatch(CANONICAL_COLOR_RE)
  const drawn = fromHex(toHex(huge))
  expect(drawn.c).toBeGreaterThan(0.15)
  expect(Math.abs(drawn.h - 30)).toBeLessThan(10)
})

describe('formatColor', () => {
  it('omits an alpha of 1 and wraps the hue', () => {
    expect(formatColor({ l: 0.5, c: 0.1, h: 359.9996, alpha: 1 })).toBe('oklch(0.5 0.1 0)')
    expect(formatColor({ l: 0.5, c: 0.1, h: -30, alpha: 0.5 })).toBe('oklch(0.5 0.1 330 / 0.5)')
  })
})
