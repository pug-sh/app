import { describe, expect, it } from 'vitest'
import { composite, contrast, luminance } from './contrast'
import { fromHex } from './oklch'

describe('contrast', () => {
  it('matches WCAG 2 on known pairs', () => {
    expect(contrast(fromHex('#000000'), fromHex('#ffffff'))).toBeCloseTo(21, 4)
    expect(contrast(fromHex('#777777'), fromHex('#ffffff'))).toBeCloseTo(4.48, 2)
    expect(contrast(fromHex('#ffffff'), fromHex('#777777'))).toBeCloseTo(4.48, 2)
  })

  it('composites a translucent ink onto its ground first', () => {
    const ground = fromHex('#ffffff')
    const half = { ...fromHex('#000000'), alpha: 0.5 }
    expect(contrast(half, ground)).toBeCloseTo(contrast(composite(half, ground), ground), 6)
    expect(contrast(half, ground)).toBeLessThan(contrast(fromHex('#000000'), ground))
  })

  it('blends in gamma space, as browsers do', () => {
    // 50% black over white is #808080 in gamma-encoded sRGB, not the linear midpoint.
    expect(luminance(composite({ ...fromHex('#000000'), alpha: 0.5 }, fromHex('#ffffff')))).toBeCloseTo(
      luminance(fromHex('#808080')),
      2,
    )
  })
})
