import { describe, expect, it } from 'vitest'
import { deltaE, worstDeltaE } from './cvd'
import { fromHex } from './oklch'

describe('colour-vision simulation', () => {
  // payment_failed / payment_succeeded as Pug draws them on the light canvas today (after the fit):
  // far apart for most readers, nearly identical under deuteranopia.
  it('collapses the red/green pair Pug crosses today, and keeps Okabe–Ito apart', () => {
    const red = fromHex('#ab423a')
    const green = fromHex('#117e38')
    expect(deltaE(red, green)).toBeGreaterThan(0.2)
    expect(deltaE(red, green, 'deutan')).toBeLessThan(0.02)
    expect(worstDeltaE(fromHex('#d55e00'), fromHex('#0072b2'))).toBeGreaterThan(0.15)
  })

  // Literals from an independent implementation of Machado 2009 (severity 1) and Oklab. Each pair
  // lands differently under each deficiency, so a swapped or mistyped matrix moves its number.
  it.each([
    ['protan', 0.440861, 0.603439],
    ['deutan', 0.222155, 0.656944],
    ['tritan', 0.473013, 0.478009],
  ] as const)('simulates %s as Machado 2009 does', (kind, redGreen, blueYellow) => {
    expect(deltaE(fromHex('#ff0000'), fromHex('#00ff00'), kind)).toBeCloseTo(redGreen, 5)
    expect(deltaE(fromHex('#0000ff'), fromHex('#ffff00'), kind)).toBeCloseTo(blueYellow, 5)
  })

  it('is zero for identical colours', () => {
    expect(worstDeltaE(fromHex('#3b6cf0'), fromHex('#3b6cf0'))).toBe(0)
  })
})
