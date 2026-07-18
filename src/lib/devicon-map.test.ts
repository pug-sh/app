import { describe, expect, it } from 'vitest'
import { resolveDeviceModelDevicon } from './devicon-map'

describe('resolveDeviceModelDevicon', () => {
  it('maps Apple device families to the Apple glyphs', () => {
    expect(resolveDeviceModelDevicon('iPhone')).toBe('ios')
    expect(resolveDeviceModelDevicon('iPad')).toBe('ios')
    expect(resolveDeviceModelDevicon('Mac')).toBe('macos')
    expect(resolveDeviceModelDevicon('Macintosh')).toBe('macos')
  })

  it('maps major Android brands to the Android glyph', () => {
    expect(resolveDeviceModelDevicon('Samsung Galaxy S24')).toBe('android-original')
    expect(resolveDeviceModelDevicon('Pixel 8')).toBe('android-original')
    expect(resolveDeviceModelDevicon('OnePlus 12')).toBe('android-original')
    expect(resolveDeviceModelDevicon('Redmi Note 13')).toBe('android-original')
  })

  it('is case-insensitive', () => {
    expect(resolveDeviceModelDevicon('pixel 8')).toBe('android-original')
  })

  it('returns null for unknown models, bots, and blanks', () => {
    expect(resolveDeviceModelDevicon('Spider')).toBeNull()
    expect(resolveDeviceModelDevicon('SmartTV')).toBeNull()
    expect(resolveDeviceModelDevicon('')).toBeNull()
    expect(resolveDeviceModelDevicon(undefined)).toBeNull()
  })
})
